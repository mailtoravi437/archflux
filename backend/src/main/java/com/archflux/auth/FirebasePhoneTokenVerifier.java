package com.archflux.auth;

import com.archflux.service.ApiException;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * firebase-admin {@code verifyIdToken}: checks signature (Google public keys), issuer/audience
 * (the project id) and expiry. Needs only the project id: no service-account key. The token and
 * the phone number are never logged.
 */
@Service
public class FirebasePhoneTokenVerifier implements PhoneTokenVerifier {

  private static final Logger log = LoggerFactory.getLogger(FirebasePhoneTokenVerifier.class);
  private static final String APP_NAME = "archflux-phone-signin";
  private static final Pattern E164 = Pattern.compile("^\\+[1-9][0-9]{6,14}$");

  private final String projectId;
  private volatile FirebaseAuth auth;

  public FirebasePhoneTokenVerifier(@Value("${app.firebase.project-id:}") String projectId) {
    this.projectId = projectId == null ? "" : projectId.trim();
  }

  @Override
  public String verify(String idToken) {
    if (projectId.isEmpty()) {
      throw new ApiException("PHONE_SIGNIN_UNAVAILABLE", 503, "Phone sign-in is not configured");
    }
    FirebaseToken token;
    try {
      token = auth().verifyIdToken(idToken);
    } catch (FirebaseAuthException | IllegalArgumentException e) {
      log.info("Firebase ID token rejected: {}", e.getClass().getSimpleName());
      throw invalid();
    }
    Object phone = token.getClaims().get("phone_number");
    if (!(phone instanceof String p) || !E164.matcher(p).matches()) {
      throw invalid();
    }
    if (!(token.getClaims().get("firebase") instanceof Map<?, ?> firebase)
        || !"phone".equals(firebase.get("sign_in_provider"))) {
      throw invalid();
    }
    return p;
  }

  private static ApiException invalid() {
    return new ApiException("INVALID_FIREBASE_TOKEN", 401, "Phone sign-in could not be verified");
  }

  private FirebaseAuth auth() {
    FirebaseAuth a = auth;
    if (a == null) {
      synchronized (this) {
        a = auth;
        if (a == null) {
          FirebaseApp app;
          try {
            app = FirebaseApp.getInstance(APP_NAME);
          } catch (IllegalStateException notYet) {
            // Token verification needs no credentials; an empty credential object avoids the
            // Application Default Credentials lookup that would fail on a plain server.
            app = FirebaseApp.initializeApp(FirebaseOptions.builder()
                .setProjectId(projectId)
                .setCredentials(GoogleCredentials.create(null))
                .build(), APP_NAME);
          }
          a = FirebaseAuth.getInstance(app);
          auth = a;
        }
      }
    }
    return a;
  }
}
