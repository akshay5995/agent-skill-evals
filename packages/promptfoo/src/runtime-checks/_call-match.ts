import { matchesSubset } from "./_match.js";

export interface CallMatchArgs {
  tool?: string;
  provider?: string;
  server?: string;
  args_match?: unknown;
}

interface RecordedCall {
  tool: string;
  provider?: string;
  server?: string;
  args?: unknown;
}

export function matchesRecordedCall(call: RecordedCall, args: CallMatchArgs): boolean {
  return (
    (!args.tool || call.tool === args.tool) &&
    (!args.provider || call.provider === args.provider) &&
    (!args.server || call.server === args.server) &&
    (args.args_match === undefined || matchesSubset(call.args, args.args_match))
  );
}
