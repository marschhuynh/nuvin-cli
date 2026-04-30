export type AcpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string; altText?: string }
  | {
      type: "resource";
      resource: {
        uri?: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      };
    }
  | {
      type: "resource_link";
      uri: string;
      name?: string;
      title?: string;
      mimeType?: string;
    };

export function toUserMessagePayload(blocks: AcpContentBlock[]) {
  const textParts: string[] = [];
  const attachments: Array<{
    type: "image";
    mimeType: string;
    data: string;
    altText?: string;
  }> = [];

  for (const block of blocks) {
    if (block.type === "text") {
      textParts.push(block.text);
    }
    if (block.type === "resource") {
      const label = block.resource.uri
        ? `Resource: ${block.resource.uri}`
        : "Resource";
      const body =
        typeof block.resource.text === "string" ? block.resource.text : "";
      textParts.push(`${label}\n${body}`.trim());
    }
    if (block.type === "resource_link") {
      textParts.push(`Resource: ${block.uri}`);
    }
    if (block.type === "image") {
      attachments.push({
        type: "image",
        mimeType: block.mimeType,
        data: block.data,
        altText: block.altText,
      });
    }
  }

  return {
    text: textParts.join("\n\n"),
    attachments,
  };
}

export function toTextContentBlock(text: string): AcpContentBlock {
  return { type: "text", text };
}
