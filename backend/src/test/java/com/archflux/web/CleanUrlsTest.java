package com.archflux.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** Clean URLs (decision 2026-10-31): the SPA uses path routing, so server-built links carry no '#'. */
class CleanUrlsTest {

  @Test
  void spaUrlHasNoHash() {
    AuthController controller = new AuthController(null, null, null, null, null, null, null);
    ReflectionTestUtils.setField(controller, "frontendUrl", "https://archflux.in/");
    assertThat(controller.spaUrl("/auth/callback?provider=email"))
        .isEqualTo("https://archflux.in/auth/callback?provider=email");
    assertThat(controller.spaUrl("/login?error=invalid_token")).doesNotContain("#");
  }

  @Test
  void noMainSourceBuildsAHashRoute() throws IOException {
    List<String> offenders;
    try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
      offenders =
          files
              .filter(p -> p.toString().endsWith(".java"))
              .filter(
                  p -> {
                    try {
                      return Files.readString(p).contains("/#/");
                    } catch (IOException e) {
                      throw new RuntimeException(e);
                    }
                  })
              .map(Path::toString)
              .toList();
    }
    assertThat(offenders).isEmpty();
  }
}
