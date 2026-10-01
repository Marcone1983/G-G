function isClientAbort(error) {
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = "code" in current ? String(current.code) : "";
    const name = "name" in current ? String(current.name) : "";
    const message = "message" in current ? String(current.message) : "";
    if (
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "ABORT_ERR" ||
      name === "AbortError" ||
      message === "aborted" ||
      message.includes("The operation was aborted")
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

process.on("unhandledRejection", (error) => {
  if (isClientAbort(error)) return;
  console.error("[preview-guard] unhandledRejection", error);
});

process.on("uncaughtException", (error) => {
  if (isClientAbort(error)) return;
  console.error("[preview-guard] uncaughtException", error);
  process.exit(1);
});
