package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  // citext -> String (see OtherStringUserType; keeps validate green).
  @org.hibernate.annotations.Type(OtherStringUserType.class)
  @Column(name = "email", nullable = false, unique = true, columnDefinition = "citext")
  private String email;

  @Column(name = "name", nullable = false)
  private String name = "";

  @Column(name = "role", nullable = false)
  private String role = "member";

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected User() {
  }

  public User(UUID id, String email, String name, String role) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.role = role;
  }

  @PrePersist
  void prePersist() {
    if (id == null) {
      id = UUID.randomUUID();
    }
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
