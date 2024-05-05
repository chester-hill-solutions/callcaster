# Welcome to Remix with Supabase Auth!

- [Remix Docs](https://remix.run/docs)
- [Supabase Docs](https://supabase.com/docs)

## Development

Create .env file, and retireve your Supabase variables.

`SUPABASE_URL=https://yoursupabaseurl.com`

`SUPABASE_ANON_KEY=your.anonkey`

From your terminal:

```sh
npm run dev
```

This starts your app in development mode, rebuilding assets on file changes.

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `remix build`

- `build/`
- `public/build/`
