# Public content pages

The public `/` page displays published project news. News text is stored in PostgreSQL (`project_news`) and uploaded covers are stored in `public/news-assets/`. That directory is intentionally ignored by Git; both the database and news assets are included in an administrator backup.

The `/downloads` page displays published printable materials. Its metadata lives in `database/download-materials.json`, while files and covers live in `public/downloads/`. These paths are included in the restricted production content publish allowlist, so an administrator can save a material and then use **Integrations → Commit + push** to publish it to GitHub.

Both content types are edited in **Admin → Content → Pages & Downloads**. Ukrainian and English fields are stored separately. Public APIs expose published entries only; all editor mutations require an administrator session and CSRF validation.
