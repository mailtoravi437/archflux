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

  // OAuth2 fields
  @Column(name = "provider")
  private String provider;

  @Column(name = "provider_id")
  private String providerId;

  @Column(name = "avatar_url")
  private String avatarUrl;

  @Column(name = "access_token", columnDefinition = "TEXT")
  private String accessToken;

  @Column(name = "last_login_at")
  private java.time.Instant lastLoginAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public User() {
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

  public String getProvider() {
    return provider;
  }

  public void setProvider(String provider) {
    this.provider = provider;
  }

  public String getProviderId() {
    return providerId;
  }

  public void setProviderId(String providerId) {
    this.providerId = providerId;
  }

  public String getAvatarUrl() {
    return avatarUrl;
  }

  public void setAvatarUrl(String avatarUrl) {
    this.avatarUrl = avatarUrl;
  }

  public String getAccessToken() {
    return accessToken;
  }

  public void setAccessToken(String accessToken) {
    this.accessToken = accessToken;
  }

  public java.time.Instant getLastLoginAt() {
    return lastLoginAt;
  }

  public void setLastLoginAt(java.time.Instant lastLoginAt) {
    this.lastLoginAt = lastLoginAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
