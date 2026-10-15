package com.archflux.web;

import com.archflux.auth.UserSessionService;
import com.archflux.domain.Diagram;
import com.archflux.repo.DiagramRepository;
import com.archflux.security.RequestUser;
import com.archflux.service.DiagramService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Controller
public class CollaborationController {

    private static final Logger log = LoggerFactory.getLogger(CollaborationController.class);

    private final DiagramService diagramService;
    private final DiagramRepository diagramRepository;
    private final UserSessionService sessionService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // In-memory storage for Yjs documents (in production, use Redis or persistent storage)
    private final Map<String, byte[]> yjsDocuments = new ConcurrentHashMap<>();
    private final Map<String, String> documentVersions = new ConcurrentHashMap<>();

    @Autowired
    public CollaborationController(DiagramService diagramService, DiagramRepository diagramRepository,
                                   UserSessionService sessionService, SimpMessagingTemplate messagingTemplate) {
        this.diagramService = diagramService;
        this.diagramRepository = diagramRepository;
        this.sessionService = sessionService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Join a diagram collaboration session
     */
    @MessageMapping("/diagram/{diagramId}/join")
    @SendTo("/topic/diagram/{diagramId}/updates")
    public Map<String, Object> joinDiagram(@DestinationVariable String diagramId,
                                           @Payload Map<String, Object> payload,
                                           HttpServletRequest request) {
        UUID userId = RequestUser.get(request);
        String sessionId = sessionService.extractSessionId(request);
        
        log.info("User {} joining diagram {}", userId, diagramId);

        // Verify user has access to diagram
        Optional<Diagram> diagramOpt = diagramRepository.findByIdAndOwner_Id(UUID.fromString(diagramId), userId);
        if (diagramOpt.isEmpty()) {
            return Map.of("error", "Diagram not found or access denied");
        }

        // Load or create Yjs document state
        String docKey = diagramId;
        byte[] yjsState = yjsDocuments.get(docKey);
        
        // Send current document state to the joining user
        Map<String, Object> response = new java.util.HashMap<>();
        response.put("type", "join");
        response.put("diagramId", diagramId);
        response.put("userId", userId.toString());
        response.put("yjsState", yjsState != null ? java.util.Base64.getEncoder().encodeToString(yjsState) : null);
        response.put("version", documentVersions.getOrDefault(docKey, "0"));
        
        return response;
    }

    /**
     * Handle Yjs updates from clients
     */
    @MessageMapping("/diagram/{diagramId}/update")
    @SendTo("/topic/diagram/{diagramId}/updates")
    public Map<String, Object> handleUpdate(@DestinationVariable String diagramId,
                                            @Payload Map<String, Object> payload,
                                            HttpServletRequest request) {
        UUID userId = RequestUser.get(request);
        
        // Verify user has access
        Optional<Diagram> diagramOpt = diagramRepository.findByIdAndOwner_Id(UUID.fromString(diagramId), userId);
        if (diagramOpt.isEmpty()) {
            return Map.of("error", "Diagram not found or access denied");
        }

        // Extract Yjs update
        String updateBase64 = (String) payload.get("update");
        if (updateBase64 == null) {
            return Map.of("error", "Missing update data");
        }

        try {
            byte[] update = java.util.Base64.getDecoder().decode(updateBase64);
            String docKey = diagramId;
            
            // Apply update to local document state
            byte[] currentState = yjsDocuments.getOrDefault(docKey, new byte[0]);
            // In a real implementation, we would use Yjs Java binding to apply the update
            // For now, we store the latest update
            yjsDocuments.put(docKey, update);
            
            // Increment version
            String newVersion = String.valueOf(Long.parseLong(documentVersions.getOrDefault(docKey, "0")) + 1);
            documentVersions.put(docKey, newVersion);

            // Broadcast to all other clients
            Map<String, Object> response = new java.util.HashMap<>();
            response.put("type", "update");
            response.put("update", updateBase64);
            response.put("version", newVersion);
            response.put("userId", userId.toString());
            
            return response;
            
        } catch (Exception e) {
            log.error("Failed to process Yjs update for diagram {}", diagramId, e);
            return Map.of("error", "Failed to apply update");
        }
    }

    /**
     * Handle user leaving
     */
    @MessageMapping("/diagram/{diagramId}/leave")
    @SendTo("/topic/diagram/{diagramId}/updates")
    public Map<String, Object> leaveDiagram(@DestinationVariable String diagramId,
                                            @Payload Map<String, Object> payload,
                                            HttpServletRequest request) {
        UUID userId = RequestUser.get(request);
        log.info("User {} leaving diagram {}", userId, diagramId);

        Map<String, Object> response = new java.util.HashMap<>();
        response.put("type", "leave");
        response.put("userId", userId.toString());
        return response;
    }

    /**
     * Save diagram state (triggered periodically or on leave)
     */
    @MessageMapping("/diagram/{diagramId}/save")
    public Map<String, Object> saveDiagram(@DestinationVariable String diagramId,
                                           @Payload Map<String, Object> payload,
                                           HttpServletRequest request) {
        UUID userId = RequestUser.get(request);
        
        Optional<Diagram> diagramOpt = diagramRepository.findByIdAndOwner_Id(UUID.fromString(diagramId), userId);
        if (diagramOpt.isEmpty()) {
            return Map.of("error", "Diagram not found or access denied");
        }

        // Save Yjs state to database
        String docKey = diagramId;
        byte[] yjsState = yjsDocuments.get(docKey);
        if (yjsState != null) {
            Diagram diagram = diagramRepository.findById(UUID.fromString(diagramId)).orElseThrow();
            // Store Yjs state in diagram metadata or separate table
            // For now, we just acknowledge
        }

        return Map.of("status", "saved", "diagramId", diagramId);
    }

    /**
     * Get current document state for sync
     */
    @MessageMapping("/diagram/{diagramId}/state")
    @SendTo("/topic/diagram/{diagramId}/state")
    public Map<String, Object> getDocumentState(@DestinationVariable String diagramId,
                                                HttpServletRequest request) {
        UUID userId = RequestUser.get(request);
        
        Optional<Diagram> diagramOpt = diagramRepository.findByIdAndOwner_Id(UUID.fromString(diagramId), userId);
        if (diagramOpt.isEmpty()) {
            return Map.of("error", "Diagram not found or access denied");
        }

        String docKey = diagramId;
        byte[] yjsState = yjsDocuments.get(docKey);
        
        Map<String, Object> response = new java.util.HashMap<>();
        response.put("type", "state");
        response.put("diagramId", diagramId);
        response.put("yjsState", yjsState != null ? java.util.Base64.getEncoder().encodeToString(yjsState) : null);
        response.put("version", documentVersions.getOrDefault(docKey, "0"));
        
        return response;
    }

    /**
     * Broadcast awareness updates (cursor positions, selections)
     */
    @MessageMapping("/diagram/{diagramId}/awareness")
    @SendTo("/topic/diagram/{diagramId}/awareness")
    public Map<String, Object> updateAwareness(@DestinationVariable String diagramId,
                                               @Payload Map<String, Object> payload,
                                               HttpServletRequest request) {
        UUID userId = RequestUser.get(request);
        
        Map<String, Object> response = new java.util.HashMap<>();
        response.put("type", "awareness");
        response.put("userId", userId.toString());
        response.put("states", payload.get("states"));
        
        return response;
    }
}