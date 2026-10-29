package com.archflux.security;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Bridges the JWT identity validated by {@link AuthFilter} into Spring
 * Security's context. Instantiated directly in {@code SecurityConfig} and
 * positioned right after {@code SecurityContextHolderFilter} (which installs
 * a fresh deferred context, so anything set further upstream would not
 * survive). Requests without a validated {@code RequestUser} are left alone.
 */
public final class RequestUserBridgeFilter extends OncePerRequestFilter {

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    Object id = request.getAttribute(RequestUser.ATTRIBUTE);
    if (id instanceof UUID uuid) {
      Object role = request.getAttribute(RequestUser.ATTRIBUTE + ".role");
      String authority = "ROLE_"
          + (role instanceof String s && !s.isBlank() ? s.toUpperCase(Locale.ROOT) : "MEMBER");
      SecurityContext context = SecurityContextHolder.createEmptyContext();
      context.setAuthentication(new UsernamePasswordAuthenticationToken(uuid, "N/A",
          List.of(new SimpleGrantedAuthority(authority))));
      SecurityContextHolder.setContext(context);
    } else if (Boolean.TRUE.equals(request.getAttribute(ShareTokens.SHARE_ONLY_ATTRIBUTE))) {
      // Link-only read admitted by AuthFilter (R1-E07-T03): no user identity.
      SecurityContext context = SecurityContextHolder.createEmptyContext();
      context.setAuthentication(new UsernamePasswordAuthenticationToken("share-link", "N/A",
          List.of(new SimpleGrantedAuthority("ROLE_SHARE_LINK"))));
      SecurityContextHolder.setContext(context);
    }
    chain.doFilter(request, response);
  }
}
