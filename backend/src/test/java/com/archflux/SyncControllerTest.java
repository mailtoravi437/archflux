package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;

import com.archflux.web.SyncController;
import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

/** Webhook crypto regression tests: single-pass HMAC-SHA256, hex encoding. */
class SyncControllerTest {

  @Test
  void hmacMatchesJceReferenceVector() throws Exception {
    String data = "{\"zen\":\"test\"}";
    String secret = "webhook-secret";
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    byte[] expected = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    StringBuilder hex = new StringBuilder();
    for (byte b : expected) {
      hex.append(String.format("%02x", b));
    }
    // Reflective call: method is package-visible static on SyncController.
    var method = SyncController.class.getDeclaredMethod("hmacSha256", String.class, String.class);
    method.setAccessible(true);
    String actual = (String) method.invoke(null, data, secret);
    assertThat(actual).isEqualTo(hex.toString()).hasSize(64);
  }

  @Test
  void hmacIsDeterministicAndSecretSensitive() throws Exception {
    var method = SyncController.class.getDeclaredMethod("hmacSha256", String.class, String.class);
    method.setAccessible(true);
    String a = (String) method.invoke(null, "payload", "s1");
    String b = (String) method.invoke(null, "payload", "s1");
    String c = (String) method.invoke(null, "payload", "s2");
    assertThat(a).isEqualTo(b);
    assertThat(a).isNotEqualTo(c);
  }
}
