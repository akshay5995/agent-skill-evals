// Returns the post-login redirect target. Bug: should redirect to
// "/dashboard" but currently sends users to "/wrong-path".
export function loginRedirect() {
  return "/wrong-path";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(loginRedirect());
}
