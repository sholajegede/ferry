export async function POST(request: Request) {
  return Response.redirect(new URL("/", request.url), 303);
}

export async function GET(request: Request) {
  return Response.redirect(new URL("/", request.url), 303);
}
