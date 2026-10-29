package com.archflux.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.User;

public interface UserRepository extends JpaRepository<User, UUID> {
    // email is citext (case-insensitive); avoid derived IgnoreCase which emits
    // upper() and breaks with the custom citext UserType mapping.
    @org.springframework.data.jpa.repository.Query("SELECT u FROM User u WHERE u.email = :email")
    Optional<User> findByEmailIgnoreCase(@org.springframework.data.repository.query.Param("email") String email);
}
