begin;

truncate table audit_logs, payments, class_registrations, class_sessions, reviews, portfolio_items,
  appointments, booking_holds, booking_policy_acceptance, notifications,
  blocked_times, barber_schedule, salon_schedule, barber_services, barber_skills, service_combination_rules,
  user_roles, skills, services, barbers, users, products restart identity cascade;

insert into users (phone, name, role, password_hash) values
  ('09120000001', 'کیان مرادی', 'SUPER_ADMIN', 'a7cb84d74fd7e9dc0ae672738ee3dd8cff830b2877d2312777b8af4cbe75dd3a'),
  ('09120000002', 'فرشید معروف پور', 'BARBER', '4c33047d40ecb2db901bb065a082709a91f81cb989e6162a0414efa770376659'),
  ('09120000003', 'سامان یزدانی', 'BARBER', '4c33047d40ecb2db901bb065a082709a91f81cb989e6162a0414efa770376659'),
  ('09120000004', 'نیما فتحی', 'BARBER', '4c33047d40ecb2db901bb065a082709a91f81cb989e6162a0414efa770376659'),
  ('09120000005', 'مریم صدر', 'RECEPTIONIST', 'd552cb20b6529cc99fd13e9e463f196835c0c639bd4bf58ac6e42891ff3494d0');

-- Multi-role membership (source of truth for authorization). A person can hold
-- several roles at once; skills are separate from roles.
insert into user_roles (user_id, role) values
  (1, 'SUPER_ADMIN'), (1, 'MANAGER'),
  (2, 'BARBER'), (2, 'INSTRUCTOR'), (2, 'MANAGER'),
  (3, 'BARBER'),
  (4, 'BARBER'), (4, 'INSTRUCTOR'),
  (5, 'RECEPTIONIST'), (5, 'FINANCE');

insert into users (phone, name, role) values
  ('09129998877', 'سارا کاظمی', 'CLIENT');
insert into user_roles (user_id, role) values
  (6, 'CLIENT'), (6, 'TRAINEE');

insert into barbers (user_id, slug, name, title, bio, readme, experience_years) values
  (2, 'farshid-maroufpour', 'فرشید معروف پور', 'بنیان‌گذار و مدیر آکادمی', 'متخصص اسکین‌فید و طراحی خط ریش با ۱۲ سال سابقه در تهران و استانبول.',
   E'سلام، من فرشید معروف پور هستم.\n\nکار من روی دقت خط و تناسب فرم صورت متمرکز است. قبل از شروع، فرم سر و رویش مو را بررسی می‌کنم و مدل را با سبک زندگی شما تطبیق می‌دهم.\n\nتخصص‌ها: اسکین‌فید، تکسچرد کراپ، طراحی ریش کلاسیک.\nاگر برای اولین بار می‌آیید، ۱۰ دقیقه زودتر تشریف بیاورید.', 12),
  (3, 'saman', 'سامان یزدانی', 'باربر ارشد', 'کار با قیچی و مدل‌های کلاسیک اروپایی؛ عاشق پومپادور و سایدپارت.',
   E'کار من بیشتر روی مدل‌های کلاسیک و سیزر ورک است.\n\nاگر دنبال یک اصلاح تمیز و رسمی هستید، انتخاب درستی کرده‌اید.', 8),
  (4, 'nima', 'نیما فتحی', 'باربر و مربی آکادمی', 'رنگ و استایل مدرن؛ مربی دوره‌های فید در آکادمی زیبایی فرشید معروف پور.',
   E'در کنار کار روی صندلی، مربی دوره‌های فید هستم.\n\nدر جلسات آموزشی روی زاویه تیغ و ترکیب گاردها تمرکز می‌کنیم.', 6);

insert into skills (name) values
  ('اسکین فید'), ('تکسچرد کراپ'), ('اصلاح کلاسیک'), ('سیزر ورک'),
  ('طراحی ریش'), ('استایل مو'), ('رنگ مو');

-- Only APPROVED skills take part in scheduling. سامان claimed رنگ مو but it is
-- awaiting management approval, so he is not eligible for the colour service yet.
insert into barber_skills (barber_id, skill_id, status, approved_by, approved_at) values
  (1,1,'APPROVED',1,now()),(1,2,'APPROVED',1,now()),(1,5,'APPROVED',1,now()),(1,6,'APPROVED',1,now()),
  (2,3,'APPROVED',1,now()),(2,4,'APPROVED',1,now()),(2,6,'APPROVED',1,now()),
  (3,1,'APPROVED',1,now()),(3,7,'APPROVED',1,now()),(3,2,'APPROVED',1,now()),
  (2,7,'PENDING',null,null);

insert into services (name, slug, description, duration_min, barber_duration_min, buffer_min, base_price, payment_mode, deposit_amount) values
  ('اصلاح مو', 'haircut', 'مشاوره فرم، اصلاح کامل و حالت‌دهی نهایی.', 45, 45, 5, 450000, 'NO_PAYMENT', 0),
  ('اسکین فید', 'skin-fade', 'فید تمیز با تیغ و محو تدریجی حرفه‌ای.', 60, 60, 10, 620000, 'DEPOSIT', 150000),
  ('اصلاح و طراحی ریش', 'beard', 'فرم‌دهی ریش، خط‌گیری و روغن‌کاری.', 30, 30, 5, 320000, 'NO_PAYMENT', 0),
  ('پکیج مو و ریش', 'combo', 'اصلاح کامل مو به همراه طراحی ریش.', 75, 75, 10, 850000, 'DEPOSIT', 200000),
  ('رنگ و لایت', 'color', 'رنگ حرفه‌ای مردانه با محصولات وگان.', 90, 45, 15, 1200000, 'FULL_PAYMENT', 1200000);

insert into barber_services (barber_id, service_id, custom_price, custom_duration) values
  (1,1,null,null),(1,2,700000,null),(1,3,null,null),(1,4,null,null),
  (2,1,null,null),(2,3,null,null),(2,4,null,null),
  (3,1,null,null),(3,2,null,null),(3,5,null,null);

-- Data-driven combination rules (ids follow the service insert order above).
-- Absence of a pair = default policy: combinable, same barber preferred.
insert into service_combination_rules (service_a_id, service_b_id, can_combine, same_barber_required, note) values
  (1, 3, true,  true,  ''),                                                  -- haircut + beard: same barber
  (1, 4, false, false, 'پکیج مو و ریش خودش شامل اصلاح مو و ریش است؛ نیازی به رزرو جداگانه نیست.'),
  (5, 4, false, false, 'به دلیل زمان پردازش رنگ، ترکیب آن با پکیج در یک نوبت امکان‌پذیر نیست.'),
  (1, 5, true,  false, ''),                                                  -- haircut + colour: different staff allowed
  (2, 5, true,  false, '');

insert into salon_schedule (weekday, open_min, close_min, closed) values
  (0,600,1320,false),(1,600,1320,false),(2,600,1320,false),(3,600,1320,false),
  (4,600,1320,false),(5,720,1320,false),(6,0,0,true);

insert into barber_schedule (barber_id, weekday, start_min, end_min, day_off)
select b.id, w.weekday,
  case when b.id = 2 then 900 else 600 end,
  1320,
  (w.weekday = 6) or (b.id = 3 and w.weekday = 5)
from barbers b cross join (select generate_series(0,6) as weekday) w;

insert into portfolio_items (barber_id, title, category, image_url) values
  (1, 'اسکین فید کلاسیک', 'FADE', '/images/hero.jpg'),
  (1, 'تکسچرد کراپ', 'CROP', '/images/academy.jpg'),
  (2, 'سایدپارت رسمی', 'CLASSIC', '/images/hero.jpg'),
  (3, 'ترنسفورمیشن رنگ', 'TRANSFORMATION', '/images/academy.jpg');

insert into appointments (barber_id, service_id, client_name, client_phone, date, start_min, end_min, barber_end_min, price_snapshot, status, source)
values
  (1, 2, 'رضا کاظمی', '09121111111', current_date::text, 690, 750, 760, 700000, 'CONFIRMED', 'ONLINE'),
  (1, 1, 'حسین نادری', '09122222222', current_date::text, 840, 885, 890, 450000, 'CONFIRMED', 'ONLINE'),
  (2, 1, 'امیر شریفی', '09123333333', current_date::text, 780, 825, 830, 450000, 'COMPLETED', 'WALK_IN'),
  (1, 4, 'محمد امینی', '09124444444', (current_date + 1)::text, 900, 975, 985, 850000, 'CONFIRMED', 'ONLINE'),
  (3, 5, 'پویا رحیمی', '09125555555', (current_date + 2)::text, 660, 750, 720, 1200000, 'CONFIRMED', 'ONLINE'),
  (1, 1, 'سعید فراهانی', '09121111111', (current_date - 7)::text, 660, 705, 710, 450000, 'COMPLETED', 'ONLINE');

insert into blocked_times (barber_id, date, start_min, end_min, reason, full_day) values
  (1, (current_date + 1)::text, 780, 840, 'جلسه تیم', false),
  (2, (current_date + 3)::text, 0, 1440, 'مرخصی', true);

insert into reviews (barber_id, client_name, rating, comment) values
  (1, 'رضا کاظمی', 5, 'دقیق‌ترین فیدی که تا حالا گرفتم. خط ریش هم بی‌نقص بود.'),
  (1, 'سعید فراهانی', 5, 'سر وقت، تمیز و کاملاً حرفه‌ای.'),
  (2, 'امیر شریفی', 4, 'کار با قیچی عالی بود، کمی طول کشید ولی ارزشش را داشت.'),
  (3, 'پویا رحیمی', 5, 'رنگ دقیقاً همانی شد که می‌خواستم.');

insert into classes (slug, title, description, instructor_barber_id, kind, level, capacity, seats_taken, price, starts_on, sessions, location, status, outcomes) values
  ('fade-fundamentals', 'کارگاه مبانی فید', 'دو جلسه فشرده روی زاویه گارد، محو کردن و کنترل تیغ روی مدل واقعی.', 3, 'HANDS_ON', 'BEGINNER', 8, 3, 6500000, (current_date + 10)::text, 2, 'سالن مرکزی', 'OPEN',
    E'اجرای فید صفر تا سه با کنترل خط\nانتخاب گارد متناسب با فرم سر\nرفع خطاهای رایج محوکاری'),
  ('beard-masterclass', 'مسترکلاس طراحی ریش', 'یک روز کامل روی معماری ریش، خط‌گیری با تیغ و متناسب‌سازی با فرم صورت.', 1, 'MASTERCLASS', 'ADVANCED', 6, 5, 9800000, (current_date + 20)::text, 1, 'استودیو آکادمی', 'OPEN',
    E'طراحی خط ریش متناسب با فک\nکار ایمن با تیغ صاف\nمشاوره و قیمت‌گذاری سرویس ریش'),
  ('scissor-classic', 'دوره سیزر ورک کلاسیک', 'سه جلسه تخصصی برای مدل‌های کلاسیک اروپایی و کار با قیچی.', 2, 'WORKSHOP', 'INTERMEDIATE', 10, 2, 7400000, (current_date + 30)::text, 3, 'سالن مرکزی', 'OPEN',
    E'کنترل قیچی و شانه\nاجرای سایدپارت و پومپادور\nهماهنگی فرم با ساختار مو');

-- Concrete timed sessions so Academy classes block the instructor's salon slots.
insert into class_sessions (class_id, date, start_min, end_min, buffer_min) values
  (1, (current_date + 10)::text, 1020, 1140, 15),
  (1, (current_date + 11)::text, 1020, 1140, 15),
  (2, (current_date + 20)::text, 1080, 1200, 15),
  (3, (current_date + 30)::text,  900, 1020, 15),
  (3, (current_date + 31)::text,  900, 1020, 15),
  (3, (current_date + 32)::text,  900, 1020, 15);

insert into class_registrations (class_id, student_name, student_phone) values
  (1, 'یاسین مرادی', '09126666666'),
  (1, 'کامران آذری', '09127777777'),
  (1, 'بهنام کریمی', '09128888888'),
  (2, 'سجاد نوری', '09129999999'),
  (2, 'میلاد رستگار', '09121234567'),
  (2, 'وحید صابری', '09121234568'),
  (2, 'شایان مقدم', '09121234569'),
  (2, 'ارسلان دهقان', '09121234570'),
  (3, 'حامد بیات', '09121234571'),
  (3, 'مهدی سلطانی', '09121234572');

insert into products (name, slug, category, price, description, image_url, in_stock, rating) values
  ('پماد مدل‌دهی مو', 'styling-pomade', 'استایل مو', 480000,
   'پماد پایه‌آب با نگهداری متوسط؛ برای فینیش تمیز و قابل بازچینش.', '/images/product-pomade.jpg', true, 5),
  ('رس حجم‌دهنده', 'texture-clay', 'استایل مو', 520000,
   'رس مات با قدرت بالا برای کراپ و تکسچر روزانه؛ بدون درخشندگی.', '/images/product-clay.jpg', true, 4),
  ('روغن ریش بیدستر', 'beard-oil', 'مراقبت ریش', 390000,
   'ترکیب روغن بیدستر، جوجوبا و ویتامین E برای نرمی و درخشش طبیعی ریش.', '/images/product-beard-oil.jpg', true, 5),
  ('شامپو تقویت‌کننده', 'strengthening-shampoo', 'مراقبت مو', 340000,
   'شامپوی سولفات‌آزاد با کافئین و بیوتین برای کاهش ریزش و تقویت ساقه مو.', '/images/product-shampoo.jpg', false, 4);

insert into audit_logs (actor, action, target) values
  ('user:1', 'BARBER_CREATED', 'arsham'),
  ('user:1', 'SALON_HOURS_UPDATED', 'weekday:6'),
  ('user:1', 'CLASS_CREATED', 'beard-masterclass');

commit;
