import type {
  AnyExtensionRegistration,
  ExtensionContext,
  ExtensionRegistry,
  PayloadByStage,
  Stage,
  TransformerExtensionRegistration,
} from "../shared/types.ts";

function getOrderedObserverExtensions(
  extensions: AnyExtensionRegistration[],
  stage: Stage,
): Array<AnyExtensionRegistration & { kind: "observer" }> {
  return extensions
    .filter((extension): extension is AnyExtensionRegistration & { kind: "observer" } => {
      return (
        extension.enabled !== false && extension.stage === stage && extension.kind === "observer"
      );
    })
    .sort((left, right) => left.order - right.order);
}

function getOrderedTransformerExtensions(
  extensions: AnyExtensionRegistration[],
  stage: Stage,
): Array<AnyExtensionRegistration & { kind: "transformer" }> {
  return extensions
    .filter((extension): extension is AnyExtensionRegistration & { kind: "transformer" } => {
      return (
        extension.enabled !== false && extension.stage === stage && extension.kind === "transformer"
      );
    })
    .sort((left, right) => left.order - right.order);
}

export function createExtensionRegistry(): ExtensionRegistry {
  const extensions: AnyExtensionRegistration[] = [];

  return {
    register(extension: AnyExtensionRegistration): void {
      extensions.push(extension);
    },

    async runTransformers<S extends Stage>(
      stage: S,
      payload: PayloadByStage[S],
      ctx: ExtensionContext,
    ): Promise<PayloadByStage[S]> {
      let nextPayload = payload;

      for (const extension of getOrderedTransformerExtensions(extensions, stage)) {
        nextPayload = await (
          extension.run as unknown as TransformerExtensionRegistration<S>["run"]
        )(nextPayload, ctx);
      }

      return nextPayload;
    },

    async runObservers<S extends Stage>(
      stage: S,
      payload: PayloadByStage[S],
      ctx: ExtensionContext,
    ): Promise<void> {
      for (const extension of getOrderedObserverExtensions(extensions, stage)) {
        await extension.run(payload as never, ctx);
      }
    },
  };
}
