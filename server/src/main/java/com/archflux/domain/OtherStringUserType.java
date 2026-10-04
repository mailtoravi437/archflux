package com.archflux.domain;

import java.io.Serializable;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Objects;
import org.hibernate.HibernateException;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.type.descriptor.jdbc.JdbcType;
import org.hibernate.type.spi.TypeConfiguration;
import org.hibernate.usertype.UserType;

/**
 * Maps text-like non-VARCHAR columns (jsonb graph/snapshot, citext email) to
 * plain Java String. SQL type OTHER keeps ddl-auto: validate green; binding
 * goes through {@link OtherStringJdbcType}. Jackson (de)serialization stays in
 * the service layer, so no extra mapping libraries are needed.
 */
public class OtherStringUserType implements UserType<String> {

  @Override
  public int getSqlType() {
    return Types.OTHER;
  }

  @Override
  public JdbcType getJdbcType(TypeConfiguration typeConfiguration) {
    return OtherStringJdbcType.INSTANCE;
  }

  @Override
  public Class<String> returnedClass() {
    return String.class;
  }

  @Override
  public boolean equals(String x, String y) throws HibernateException {
    return Objects.equals(x, y);
  }

  @Override
  public int hashCode(String x) throws HibernateException {
    return x == null ? 0 : x.hashCode();
  }

  @Override
  public String nullSafeGet(ResultSet rs, int position,
      SharedSessionContractImplementor session, Object owner) throws SQLException {
    String value = rs.getString(position);
    return rs.wasNull() ? null : value;
  }

  @Override
  public void nullSafeSet(PreparedStatement st, String value, int index,
      SharedSessionContractImplementor session) throws SQLException {
    if (value == null) {
      st.setNull(index, Types.OTHER);
      return;
    }
    st.setObject(index, value, Types.OTHER);
  }

  @Override
  public String deepCopy(String value) throws HibernateException {
    return value;
  }

  @Override
  public boolean isMutable() {
    return false;
  }

  @Override
  public Serializable disassemble(String value) throws HibernateException {
    return value;
  }

  @Override
  public String assemble(Serializable cached, Object owner) throws HibernateException {
    return (String) cached;
  }

  @Override
  public String replace(String detached, String managed, Object owner) throws HibernateException {
    return detached;
  }
}
