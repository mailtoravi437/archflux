package com.archflux.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.Reply;

public interface ReplyRepository extends JpaRepository<Reply, UUID> {

  List<Reply> findByThread_IdOrderByCreatedAtAsc(UUID threadId);
}
