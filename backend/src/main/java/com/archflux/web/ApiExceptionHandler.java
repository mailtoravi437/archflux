package com.archflux.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.hibernate.HibernateException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.BeanCreationException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import com.archflux.service.ApiException;
import jakarta.persistence.PersistenceException;
import jakarta.validation.ConstraintViolationException;

/**
 * Typed JSON errors {@code {"error":{"code","message"}}}. Server-side logging
 * only — never leaks stacks or secrets to clients.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
    if (e.status() >= 500) {
      log.error("Request failed with {}: {}", e.code(), e.getMessage());
    } else {
      log.info("Request failed with {}: {}", e.code(), e.getMessage());
    }
    Map<String, Object> body = error(e.code(), e.getMessage());
    if (!e.extra().isEmpty()) {
      @SuppressWarnings("unchecked")
      Map<String, Object> inner = (Map<String, Object>) body.get("error");
      inner.putAll(e.extra());
    }
    return ResponseEntity.status(e.status()).body(body);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
    String message = e.getBindingResult().getFieldErrors().stream()
        .map(fe -> fe.getField() + " " + (fe.getDefaultMessage() == null ? "invalid" : fe.getDefaultMessage()))
        .findFirst().orElse("Validation failed");
    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", message));
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<Map<String, Object>> handleConstraint(ConstraintViolationException e) {
    String message = e.getConstraintViolations().stream()
        .map(v -> v.getMessage() == null ? "invalid" : v.getMessage())
        .findFirst().orElse("Validation failed");
    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", message));
  }

  @ExceptionHandler({ HttpMessageNotReadableException.class,
      MethodArgumentTypeMismatchException.class,
      MissingServletRequestParameterException.class,
      IllegalArgumentException.class })
  public ResponseEntity<Map<String, Object>> handleBadRequest(Exception e) {
    log.info("Bad request: {}", e.getMessage());
    String message = e instanceof MissingServletRequestParameterException missing
        ? missing.getParameterName() + " parameter is required"
        : "Malformed request";
    return ResponseEntity.badRequest().body(error("VALIDATION_ERROR", message));
  }

  @ExceptionHandler(NoHandlerFoundException.class)
  public ResponseEntity<Map<String, Object>> handleNoHandler(NoHandlerFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(error("NOT_FOUND", "No such endpoint: " + e.getRequestURL()));
  }

  // Spring 6.1+ raises this (not NoHandlerFoundException) for unmatched routes (SVC-G29).
  @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
  public ResponseEntity<Map<String, Object>> handleNoResource(
      org.springframework.web.servlet.resource.NoResourceFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(error("NOT_FOUND", "No such endpoint: /" + e.getResourcePath()));
  }

  @ExceptionHandler({ DataAccessException.class, HibernateException.class, PersistenceException.class })
  public ResponseEntity<Map<String, Object>> handleDataAccess(RuntimeException e) {
    log.error("Data access failure", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(error("DB_UNAVAILABLE",
            "Database unavailable — apply db/migrations/V1__init.sql with psql, then retry."));
  }

  @ExceptionHandler(BeanCreationException.class)
  public ResponseEntity<Map<String, Object>> handleBeanCreation(BeanCreationException e) {
    // A lazy infrastructure bean (e.g. the deferred EMF) may wrap a typed
    // ApiException — unwrap it deterministically when present.
    ApiException api = findApiException(e);
    if (api != null) {
      return handleApi(api);
    }
    // With lazy JPA boot, first DB touch after schema drift surfaces here.
    if (looksLikeSchemaOrConnectionFailure(e)) {
      log.error("Persistence bootstrap failure (schema/connection?)", e);
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
          .body(error("DB_UNAVAILABLE",
              "Database unavailable — apply db/migrations/V1__init.sql with psql, then retry."));
    }
    log.error("Bean creation failure", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(error("INTERNAL_ERROR", "Internal server error"));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleGeneric(Exception e) {
    log.error("Unhandled error", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(error("INTERNAL_ERROR", "Internal server error"));
  }

  private static ApiException findApiException(Throwable t) {
    Throwable current = t;
    int depth = 0;
    while (current != null && depth < 12) {
      if (current instanceof ApiException api) {
        return api;
      }
      current = current.getCause();
      depth++;
    }
    return null;
  }

  private static boolean looksLikeSchemaOrConnectionFailure(Throwable t) {
    Throwable current = t;
    int depth = 0;
    while (current != null && depth < 12) {
      String message = String.valueOf(current.getClass().getName()) + " "
          + String.valueOf(current.getMessage());
      String lowered = message.toLowerCase();
      if (lowered.contains("schema")
          || lowered.contains("missing table")
          || lowered.contains("relation")
          || lowered.contains("column")
          || lowered.contains("connection")
          || lowered.contains("refused")
          || lowered.contains("jdbc")
          || lowered.contains("hibernate")
          || lowered.contains("dialect")
          || lowered.contains("psql")
          || lowered.contains("sql")) {
        return true;
      }
      current = current.getCause();
      depth++;
    }
    return false;
  }

  static Map<String, Object> error(String code, String message) {
    Map<String, Object> inner = new LinkedHashMap<>();
    inner.put("code", code);
    inner.put("message", message);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("error", inner);
    return out;
  }
}
