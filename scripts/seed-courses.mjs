/**
 * Idempotent demo seed for the online-courses vertical (one published course
 * with two sections and three lessons). Run: node scripts/seed-courses.mjs
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const existing = await client.query("select id from courses where slug = $1", ["classic-fade-online"]);
  if (existing.rowCount > 0) {
    console.log("course classic-fade-online already exists — nothing to do");
  } else {
    const course = await client.query(
      `insert into courses (slug, title, summary, description, outcomes, level, price, capacity, status, poster_url, published_at)
       values ($1,$2,$3,$4,$5,'BEGINNER', 1200000, 4, 'PUBLISHED', '/images/academy.jpg', now())
       returning id`,
      [
        "classic-fade-online",
        "فید کلاسیک مردانه — از صفر تا فینیشینگ",
        "هفت درس ویدیویی: انتخاب کلیپر، خطوط فید، فید کلاسیک، فید اسکین، ریش و فینیشینگ — با تمرین خانگی و بازخورد مدرس.",
        "این دوره برای کسی است که می‌خواهد فید کلاسیک را اصولی یاد بگیرد: از شناخت ابزار تا فینیشینگ با قیچی. هر درس ویدیوی کامل دارد و می‌توانید تمرین‌تان را برای مدرس بفرستید؛ نتیجه و بازخورد در پنل شما ثبت می‌شود.",
        "انتخاب درست کلیپر و شیت\nساخت خط راهنمای فید\nفید کلاسیک تمیز بدون پله\nفید اسکین نرم\nترکیب ریش و مو در فینیشینگ",
      ],
    );
    const courseId = course.rows[0].id;
    const s1 = await client.query("insert into course_sections (course_id, title, position) values ($1,$2,0) returning id", [courseId, "مبانی و ابزار"]);
    const s2 = await client.query("insert into course_sections (course_id, title, position) values ($1,$2,1) returning id", [courseId, "تکنیک فید"]);
    await client.query(
      "insert into course_lessons (course_id, section_id, title, video_url, duration_min, position, free_preview, notes) values ($1,$2,$3,$4,8,0,true,$5)",
      [courseId, s1.rows[0].id, "آشنایی با کلیپر و شیت‌ها", "/video/barber-desktop.mp4", "قبل از خرید دوره ببینید — این درس برای همه باز است."],
    );
    await client.query(
      "insert into course_lessons (course_id, section_id, title, video_url, duration_min, position, free_preview) values ($1,$2,$3,null,18,1,false)",
      [courseId, s1.rows[0].id, "تنظیم فاصله تیغه و خطوط راهنما"],
    );
    await client.query(
      "insert into course_lessons (course_id, section_id, title, video_url, duration_min, position, free_preview) values ($1,$2,$3,null,24,2,false)",
      [courseId, s2.rows[0].id, "فید کلاسیک سه‌مرحله‌ای"],
    );
    console.log(`seeded course id=${courseId} (capacity 4, price 1,200,000T)`);
  }
} finally {
  await client.end();
}
