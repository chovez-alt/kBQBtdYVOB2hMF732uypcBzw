# EKY Cologne Source

Source snapshot copied from the live EKY Cologne v191 app on September 18, 2026.

This folder preserves the current app UI and behavior, including the 1,027-fragrance catalog, What's New review queue, Update Catalog workflow, Orders/inventory, Favorites, Stats, PWA manifest, icon, and service worker.

The `/api/mys-catalog` function is currently a compatibility bridge to the existing live EKY Cologne catalog API so Update Catalog and Update List continue to work when this folder is deployed as its own Vercel project.
