# Congress of Independent Unions — Static Website

A clean, American-themed website for the Congress of Independent Unions (CIU) with three sections: Home, About Us, and Contact.

## Deploying to GitHub Pages

1. Create a new GitHub repository (e.g., `ciu-website`)
2. Push all files in this folder to the `main` branch
3. Go to **Settings > Pages** in your repository
4. Under **Source**, select **Deploy from a branch**
5. Choose `main` branch and `/ (root)` folder, then click **Save**
6. Your site will be live at `https://<username>.github.io/<repo-name>/`

## Deploying to Netlify

1. Drag and drop this entire folder into [Netlify Drop](https://app.netlify.com/drop)
2. Your site will be live immediately with a Netlify URL

## Deploying to Vercel

1. Create a new project on [Vercel](https://vercel.com)
2. Import your GitHub repository or upload this folder
3. Set the **Output Directory** to `.` (root)
4. Deploy

## File Structure

```
ciu-static-site/
├── index.html          ← Main HTML file (single-page app)
├── assets/
│   ├── index-*.css     ← Compiled styles
│   └── index-*.js      ← Compiled JavaScript (React app)
└── README.md           ← This file
```

## Notes

- This is a fully static site — no server required
- All images are served from a CDN, so no local image files are needed
- The site is a single-page application with smooth scroll navigation between sections
- Asset paths are relative (`./assets/...`) so the site works in any subdirectory
