import type { ToolCall } from '@nuvin/nuvin-core';
import { FileEditToolContent } from './TooFileEdit.js';
import { FileNewToolContent } from './ToolFileNew.js';

type Props = { call: ToolCall };

export function ToolContentRenderer({ call }: Props) {
  switch (call.function.name) {
    case 'file_edit':
      return <FileEditToolContent call={call} />;
    case 'file_new':
      return <FileNewToolContent call={call} />;
    default:
      return null;
  }
}
