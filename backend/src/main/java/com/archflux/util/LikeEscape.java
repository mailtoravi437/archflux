package com.archflux.util;

/** Escapes LIKE wildcards (%, _, \) for title search. */
public final class LikeEscape {

  private LikeEscape() {
  }

  public static String escape(String input) {
    if (input == null) {
      return "";
    }
    StringBuilder sb = new StringBuilder(input.length());
    for (char c : input.toCharArray()) {
      if (c == '\\' || c == '%' || c == '_') {
        sb.append('\\');
      }
      sb.append(c);
    }
    return sb.toString();
  }
}
