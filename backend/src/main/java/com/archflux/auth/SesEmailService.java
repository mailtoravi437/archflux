package com.archflux.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.Body;
import software.amazon.awssdk.services.sesv2.model.Content;
import software.amazon.awssdk.services.sesv2.model.Destination;
import software.amazon.awssdk.services.sesv2.model.EmailContent;
import software.amazon.awssdk.services.sesv2.model.Message;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;

/**
 * Magic-link and notification email through Amazon SES (SESv2). Credentials come from the
 * default AWS chain: the EC2 instance role in production, the local profile in development.
 * Enabled with EMAIL_PROVIDER=ses; the sender identity must be verified in SES.
 */
@Service
@ConditionalOnProperty(name = "app.email.provider", havingValue = "ses")
public class SesEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(SesEmailService.class);

    private final SesV2Client client;
    private final String fromEmail;

    @Autowired
    public SesEmailService(
            @Value("${app.email.from:noreply@archflux.in}") String fromEmail,
            @Value("${aws.region:ap-southeast-2}") String region) {
        this(SesV2Client.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.builder().build())
                .build(), fromEmail);
    }

    /** Test seam: lets a unit test supply a mocked client. */
    SesEmailService(SesV2Client client, String fromEmail) {
        this.client = client;
        this.fromEmail = fromEmail;
    }

    @Override
    public void sendHtml(String to, String subject, String htmlBody) {
        SendEmailRequest request = SendEmailRequest.builder()
                .fromEmailAddress(fromEmail)
                .destination(Destination.builder().toAddresses(to).build())
                .content(EmailContent.builder().simple(Message.builder()
                        .subject(Content.builder().data(subject).charset("UTF-8").build())
                        .body(Body.builder().html(Content.builder().data(htmlBody).charset("UTF-8").build()).build())
                        .build()).build())
                .build();
        try {
            var response = client.sendEmail(request);
            log.info("Email sent via SES to {} (id: {})", to, response.messageId());
        } catch (RuntimeException e) {
            log.error("Failed to send email via SES to {}", to, e);
            throw e;
        }
    }
}
