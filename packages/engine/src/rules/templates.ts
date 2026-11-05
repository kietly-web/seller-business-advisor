import type { ActionType, Facts, RuleCode } from './types';

export interface CardText {
  title: string;
  body: string;
  why_now: string;
}

// Static fallback wording (06: TemplateLlmClient). Figures appear only as {{placeholders}} filled from facts.
export const TEMPLATES: Readonly<Record<RuleCode, CardText>> = {
  MARGIN_BELOW_TARGET_UNDERPRICED: {
    title: 'Cân nhắc tăng giá {{sku_name}} lên {{suggested_price}}',
    body: 'Biên lãi của {{sku_name}} là {{margin_pct}}, thấp hơn mục tiêu {{target_margin_pct}}. Giá của bạn ({{current_price}}) đang thấp hơn mức giữa của {{competitor_count}} đối thủ khoảng {{competitor_gap_pct}}. Ước tính lãi thay đổi từ {{impact_low}} đến {{impact_high}} mỗi tháng.',
    why_now: 'Lượng bán ổn định trong {{weeks_observed}} tuần gần đây nên đây là lúc phù hợp để thử giá mới.',
  },
  NEGATIVE_MARGIN: {
    title: '{{sku_name}} đang bán lỗ',
    body: 'Hai tuần liền {{sku_name}} lỗ sau phí và giá vốn: {{margin_last_week}} rồi {{margin_this_week}}. Giảm giá của shop tuần này: {{seller_discount}}. Nếu xử lý, ước tính bớt lỗ từ {{impact_low}} đến {{impact_high}} mỗi tháng.',
    why_now: 'Mỗi tuần bán tiếp ở mức giá này là thêm một khoản lỗ.',
  },
  STOCKOUT_RISK: {
    title: 'Nhập thêm {{sku_name}}: còn khoảng {{days_of_stock}} ngày hàng',
    body: 'Bạn còn {{on_hand}} sản phẩm và đang bán khoảng {{units_per_day}} sản phẩm mỗi ngày, trong khi nhập hàng mất {{lead_time_days}} ngày. Gợi ý nhập khoảng {{suggested_qty}} sản phẩm. Hết hàng có thể làm mất từ {{impact_low}} đến {{impact_high}} tiền lãi.',
    why_now: 'Đặt hàng hôm nay để hàng về trước khi hết.',
  },
  DEAD_STOCK: {
    title: 'Xả hàng tồn {{sku_name}}',
    body: '{{sku_name}} còn {{on_hand}} sản phẩm (giá vốn {{stock_value}}) nhưng không bán được trong {{days_without_sales}} ngày. Giảm giá, bán kèm hoặc ngừng bán có thể thu về từ {{impact_low}} đến {{impact_high}} tiền mặt.',
    why_now: 'Hàng để càng lâu càng khó bán và chiếm vốn.',
  },
  PRICE_ABOVE_MARKET_LOW_CONVERSION: {
    title: 'Xem lại giá {{sku_name}}: cao hơn đối thủ {{competitor_gap_pct}}',
    body: 'Giá của bạn ({{current_price}}) cao hơn mức giữa của {{competitor_count}} đối thủ ({{competitor_median}}), và tỷ lệ chuyển đổi chỉ {{conversion_pct}} so với {{shop_conversion_pct}} của cả shop. Ước tính lãi thêm tối đa {{impact_high}} mỗi tháng.',
    why_now: 'Khách xem nhưng ít mua, giá có thể là lý do.',
  },
  HIGH_VIEWS_LOW_CONVERSION: {
    title: 'Cải thiện trang sản phẩm {{sku_name}}',
    body: '{{sku_name}} có {{views}} lượt xem, thuộc nhóm cao nhất shop, nhưng tỷ lệ chuyển đổi chỉ {{conversion_pct}} so với {{shop_conversion_pct}} của cả shop. Giá đã sát đối thủ, nên hãy xem lại ảnh, tiêu đề và phân loại. Ước tính lãi thêm từ {{impact_low}} đến {{impact_high}} mỗi tháng.',
    why_now: 'Nhiều người đã tìm thấy sản phẩm này, chỉ cần thuyết phục họ mua.',
  },
  CAMPAIGN_UNPROFITABLE: {
    title: 'Đừng tham gia lại chương trình khuyến mãi với giá cũ cho {{sku_name}}',
    body: 'Trong đợt khuyến mãi gần nhất, {{sku_name}} bán được {{campaign_units}} sản phẩm (bình thường khoảng {{normal_units_per_week}} mỗi tuần) với giá {{campaign_price}} và lỗ {{campaign_margin}}. Giá hoà vốn khoảng {{break_even_price}}. Lần sau tránh được khoản lỗ từ {{impact_low}} đến {{impact_high}}.',
    why_now: 'Lượng bán không tăng đủ để bù phần giảm giá.',
  },
};

export const COST_MISSING_TEMPLATE = 'Nhập giá vốn cho {{sku_name}} để tính được lãi của sản phẩm bán chạy này.';

export const CHECKLISTS: Readonly<Record<`${ActionType}.v1`, readonly string[]>> = {
  'raise_price.v1': [
    'Vào Kênh Người Bán → Sản phẩm → Tất cả sản phẩm.',
    'Tìm sản phẩm, bấm Sửa.',
    'Ở mục Thông tin bán hàng, sửa Giá rồi bấm Cập nhật.',
    'Theo dõi lượng bán trong hai tuần tới trên trang Lợi nhuận.',
  ],
  'stop_discount.v1': [
    'Vào Kênh Người Bán → Kênh Marketing → Chương Trình Của Shop.',
    'Tìm chương trình đang giảm giá sản phẩm này.',
    'Bỏ sản phẩm khỏi chương trình hoặc giảm mức giảm giá.',
    'Kiểm tra cả Mã giảm giá của Shop đang áp dụng cho sản phẩm.',
  ],
  'lower_price.v1': [
    'Vào Kênh Người Bán → Sản phẩm → Tất cả sản phẩm.',
    'Tìm sản phẩm, bấm Sửa.',
    'Sửa Giá về gần mức của đối thủ, không thấp hơn giá hoà vốn.',
    'Theo dõi tỷ lệ chuyển đổi trong hai tuần tới.',
  ],
  'restock.v1': [
    'Liên hệ nhà cung cấp và đặt số lượng gợi ý.',
    'Khi hàng về, vào Kênh Người Bán → Sản phẩm → Tất cả sản phẩm.',
    'Bấm Sửa và cập nhật Kho hàng.',
  ],
  'clearance.v1': [
    'Vào Kênh Người Bán → Kênh Marketing → Chương Trình Của Shop và tạo chương trình giảm giá cho sản phẩm.',
    'Hoặc tạo Combo Khuyến Mãi để bán kèm với sản phẩm bán chạy.',
    'Nếu vẫn không bán được, cân nhắc ẩn sản phẩm và thanh lý ngoài Shopee.',
  ],
  'improve_listing.v1': [
    'Vào Kênh Người Bán → Sản phẩm → Tất cả sản phẩm, bấm Sửa sản phẩm.',
    'Thay ảnh bìa rõ nét, thêm ảnh thật và video ngắn.',
    'Viết lại tiêu đề có từ khoá khách hay tìm.',
    'Kiểm tra phân loại hàng và mô tả có đủ kích thước, chất liệu.',
  ],
  'skip_campaign.v1': [
    'Vào Kênh Người Bán → Kênh Marketing → Chương trình Shopee.',
    'Khi đăng ký đợt sau, đặt giá khuyến mãi không thấp hơn giá hoà vốn.',
    'Nếu không đạt, đừng đăng ký sản phẩm này cho đợt đó.',
  ],
};

export const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? '');
}

export function fillTemplate(text: string, facts: Facts): string {
  return text.replace(PLACEHOLDER, (match, key: string) => facts[key] ?? match);
}

export function renderCard(ruleCode: RuleCode, facts: Facts): CardText {
  const t = TEMPLATES[ruleCode];
  return { title: fillTemplate(t.title, facts), body: fillTemplate(t.body, facts), why_now: fillTemplate(t.why_now, facts) };
}
