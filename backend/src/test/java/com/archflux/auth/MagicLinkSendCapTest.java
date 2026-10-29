package com.archflux.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/** SVC-G27: at most MAX_SENDS_PER_ADDRESS magic links per address per window. */
class MagicLinkSendCapTest {

  @Test
  @SuppressWarnings("unchecked")
  void capsSendsPerAddressAndNormalisesCase() {
    RedisTemplate<String, String> redis = mock(RedisTemplate.class);
    ValueOperations<String, String> ops = mock(ValueOperations.class);
    when(redis.opsForValue()).thenReturn(ops);
    AtomicLong counter = new AtomicLong();
    when(ops.increment(anyString())).thenAnswer(inv -> counter.incrementAndGet());
    MagicLinkService svc = new MagicLinkService(redis, mock(EmailService.class));

    for (int i = 0; i < MagicLinkService.MAX_SENDS_PER_ADDRESS; i++) {
      assertTrue(svc.allowSend(i % 2 == 0 ? "Victim@Example.com" : "victim@example.com"));
    }
    assertFalse(svc.allowSend("victim@example.com"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void failsOpenWhenRedisIsDown() {
    RedisTemplate<String, String> redis = mock(RedisTemplate.class);
    when(redis.opsForValue()).thenThrow(new IllegalStateException("down"));
    assertTrue(new MagicLinkService(redis, mock(EmailService.class)).allowSend("a@b.c"));
  }
}
