package com.archflux.repo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.WebhookEvent;

public interface WebhookEventRepository extends JpaRepository<WebhookEvent, Long> {

  Optional<WebhookEvent> findByDeliveryId(String deliveryId);

  List<WebhookEvent> findByStatusOrderByReceivedAtAsc(String status);
}
