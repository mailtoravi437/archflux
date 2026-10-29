package com.archflux.auth;

public interface EmailService {
    void sendHtml(String to, String subject, String htmlBody);
}