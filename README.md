# Contributions graph

Displays a graph of the logged in user’s GitHub contributions.

![](screenshot.png)

If the request is made to the frontend base URL, it will show the contributions
for the user currently logged into GitHub. If there is a username after the base
URL, it will show the contributions for that GitHub user.

## Configuration

See [.env.example] for environment variables. You will need a GitHub client ID
and secret from https://github.com/settings/developers. The frontend URL can be
set with `$VITE_FRONTEND_URL`.

The backend should be proxied through the frontend URL at `/api`, e.g. a request
to `http://frontend/api/health` should be proxied to
`http://backend/api/health`.

## Stack

This is a TypeScript and React app with a simple Rust backend built on
[Dropshot]. Dropshot provides automatic OpenAPI support, which enables
compile-time type checking of calls across the API boundary.

## To do

- [ ] Add data source to backend so selected users’s contributions can be
      displayed to visitors without logging into GitHub.
  - Possibly use <https://github.com/graphql-rust/graphql-client>
- [ ] Add demo to <https://demon.horse/portfolio/>.
- [ ] Automated testing.
- [ ] Load information about local repositories in backend.

## License

Unless otherwise noted, this project is dual-licensed under the Apache 2 and MIT
licenses. You may choose to use either.

- [Apache License, Version 2.0](LICENSE-APACHE)
- [MIT license](LICENSE-MIT)

### Contributions

Unless you explicitly state otherwise, any contribution you submit as defined in
the Apache 2.0 license shall be dual licensed as above, without any additional
terms or conditions.

[.env.example]: .env.example
[Dropshot]: https://docs.rs/dropshot/latest/dropshot/
