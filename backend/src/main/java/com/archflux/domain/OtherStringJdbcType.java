package com.archflux.domain;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import org.hibernate.type.descriptor.WrapperOptions;
import org.hibernate.type.descriptor.java.JavaType;
import org.hibernate.type.descriptor.jdbc.BasicBinder;
import org.hibernate.type.descriptor.jdbc.BasicExtractor;
import org.hibernate.type.descriptor.jdbc.JdbcType;

/**
 * Binds String values of non-VARCHAR text-like columns (jsonb, citext) with
 * {@code setObject(index, text, Types.OTHER)} — pgjdbc then lets the server
 * cast the literal to the column type — and reads them with getString.
 * Declared SQL code is OTHER so ddl-auto: validate matches those columns.
 */
public class OtherStringJdbcType implements JdbcType {

  public static final OtherStringJdbcType INSTANCE = new OtherStringJdbcType();

  public OtherStringJdbcType() {
  }

  @Override
  public int getJdbcTypeCode() {
    return Types.OTHER;
  }

  @Override
  public <X> BasicBinder<X> getBinder(JavaType<X> javaType) {
    return new BasicBinder<>(javaType, this) {
      @Override
      protected void doBind(PreparedStatement st, X value, int index, WrapperOptions options)
          throws SQLException {
        if (value == null) {
          st.setNull(index, Types.OTHER);
          return;
        }
        st.setObject(index, javaType.unwrap(value, String.class, options), Types.OTHER);
      }

      @Override
      protected void doBind(CallableStatement st, X value, String name, WrapperOptions options)
          throws SQLException {
        throw new UnsupportedOperationException("OTHER String CallableStatement binding not supported");
      }
    };
  }

  @Override
  public <X> BasicExtractor<X> getExtractor(JavaType<X> javaType) {
    return new BasicExtractor<>(javaType, this) {
      @Override
      protected X doExtract(ResultSet rs, int index, WrapperOptions options) throws SQLException {
        return javaType.wrap(rs.getString(index), options);
      }

      @Override
      protected X doExtract(CallableStatement statement, int index, WrapperOptions options)
          throws SQLException {
        return javaType.wrap(statement.getString(index), options);
      }

      @Override
      protected X doExtract(CallableStatement statement, String name, WrapperOptions options)
          throws SQLException {
        return javaType.wrap(statement.getString(name), options);
      }
    };
  }

  @Override
  public String getFriendlyName() {
    return "OTHER_STRING";
  }
}
