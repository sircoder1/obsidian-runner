// Preserve custom settings while making the one-command setup execute in Docker.
export function dockerSetupEnv(source) {
  const settings = {
    RUNNER_MODE: "docker",
    ALLOW_LOCAL_EXECUTION: "false",
    ALLOW_DOCKER_EXECUTION: "true",
  };
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let result = source;
  for (const [key, value] of Object.entries(settings)) {
    const assignment = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[^\\r\\n]*`, "gm");
    if (assignment.test(result)) {
      result = result.replace(assignment, `${key}=${value}`);
    } else {
      if (result && !result.endsWith("\n")) result += newline;
      result += `${key}=${value}${newline}`;
    }
  }
  return result;
}
