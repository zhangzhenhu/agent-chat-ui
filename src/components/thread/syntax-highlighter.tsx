import {
  PrismAsyncLight as SyntaxHighlighterPrism,
  type SyntaxHighlighterProps as SyntaxHighlighterPrismProps,
} from "react-syntax-highlighter";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import { coldarkDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { FC, type CSSProperties, type ElementType } from "react";

// Register languages you want to support
SyntaxHighlighterPrism.registerLanguage("js", tsx);
SyntaxHighlighterPrism.registerLanguage("jsx", tsx);
SyntaxHighlighterPrism.registerLanguage("ts", tsx);
SyntaxHighlighterPrism.registerLanguage("tsx", tsx);
SyntaxHighlighterPrism.registerLanguage("python", python);

interface SyntaxHighlighterProps {
  children: string;
  language: string;
  className?: string;
  customStyle?: CSSProperties;
  showLineNumbers?: boolean;
  wrapLongLines?: boolean;
  preTag?: ElementType;
}

export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
  children,
  language,
  className,
  customStyle,
  showLineNumbers,
  wrapLongLines,
  preTag,
}) => {
  return (
    <SyntaxHighlighterPrism
      language={language}
      style={coldarkDark}
      PreTag={preTag as SyntaxHighlighterPrismProps["PreTag"]}
      showLineNumbers={showLineNumbers}
      wrapLongLines={wrapLongLines}
      customStyle={{
        margin: 0,
        width: "100%",
        background: "transparent",
        padding: "1.5rem 1rem",
        ...customStyle,
      }}
      className={className}
    >
      {children}
    </SyntaxHighlighterPrism>
  );
};
