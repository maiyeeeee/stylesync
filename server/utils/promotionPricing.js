const toCents = (value) =>
  Math.round(Number(value || 0) * 100);

async function getPromotionPrice(
  conn,
  serviceId,
  originalPrice,
  appointmentDate
) {
  const originalCents = toCents(originalPrice);

  const [rows] = await conn.query(
    `
    SELECT
      p.promotion_id,
      p.title,
      p.percent_off
    FROM ig_promotions p
    INNER JOIN ig_promotion_services ps
      ON ps.promotion_id = p.promotion_id
    WHERE ps.service_id = ?
      AND p.is_active = 1
      AND ? BETWEEN p.starts_on AND p.ends_on
    ORDER BY p.percent_off DESC, p.promotion_id DESC
    LIMIT 1
    `,
    [serviceId, appointmentDate]
  );

  const promo = rows[0] || null;

  if (!promo) {
    return {
      originalCents,
      totalCents: originalCents,
      discountCents: 0,
      promotionId: null,
      promotionPercent: null,
      promotionTitle: null,
    };
  }

  const percent = Number(promo.percent_off);

  const discountCents = Math.round(
    (originalCents * percent) / 100
  );

  return {
    originalCents,
    totalCents: originalCents - discountCents,
    discountCents,
    promotionId: promo.promotion_id,
    promotionPercent: percent,
    promotionTitle: promo.title,
  };
}

module.exports = { getPromotionPrice };
