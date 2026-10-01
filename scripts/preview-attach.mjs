export async function attachPreview() {
  const response = await fetch("http://127.0.0.1:6015/__control/target", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ port: 8080 }),
    signal: AbortSignal.timeout(2000),
  });
  return response.ok;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href || process.argv[1]?.endsWith("preview-attach.mjs")) {
  attachPreview()
    .then((ok) => {
      console.log(ok ? "PREVIEW_TARGET=8080" : "PREVIEW_TARGET_FAILED");
      process.exit(ok ? 0 : 1);
    })
    .catch((error) => {
      console.log("PREVIEW_TARGET_FAILED");
      console.error(error instanceof Error ? error.message : "attach failed");
      process.exit(1);
    });
}
