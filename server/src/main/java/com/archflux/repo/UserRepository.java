package com.archflux.repo;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.User;

public interface UserRepository extends JpaRepository<User, UUID> {
}
