package com.archflux.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import software.amazon.awssdk.services.sesv2.model.SendEmailResponse;
import org.mockito.ArgumentCaptor;

class SesEmailServiceTest {

    @Test
    void sendsHtmlFromTheConfiguredIdentity() {
        SesV2Client client = mock(SesV2Client.class);
        when(client.sendEmail(any(SendEmailRequest.class))).thenReturn(SendEmailResponse.builder().messageId("m-1").build());
        SesEmailService svc = new SesEmailService(client, "noreply@archflux.in");

        svc.sendHtml("user@example.com", "Sign in to ArchFlux", "<p>link</p>");

        ArgumentCaptor<SendEmailRequest> captor = ArgumentCaptor.forClass(SendEmailRequest.class);
        verify(client).sendEmail(captor.capture());
        SendEmailRequest sent = captor.getValue();
        org.junit.jupiter.api.Assertions.assertEquals("noreply@archflux.in", sent.fromEmailAddress());
        org.junit.jupiter.api.Assertions.assertEquals("user@example.com", sent.destination().toAddresses().get(0));
        org.junit.jupiter.api.Assertions.assertEquals("Sign in to ArchFlux", sent.content().simple().subject().data());
        org.junit.jupiter.api.Assertions.assertEquals("<p>link</p>", sent.content().simple().body().html().data());
    }
}
