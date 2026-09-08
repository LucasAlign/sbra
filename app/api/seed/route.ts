import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "HTTP seeding has been retired. Use the controlled network provisioning command." }, { status: 410 });
}
