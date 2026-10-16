package com.archflux.repo;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.Workspace;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
}
