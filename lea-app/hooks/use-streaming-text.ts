// Affichage token-by-token avec curseur clignotant

import { useState, useEffect, useRef } from 'react';

interface StreamingTextOptions {
  speed?: number; // ms par caractere (defaut: 10)
  cursor?: boolean;
}

export function useStreamingText(
  text: string,
  isStreaming: boolean,
  options: StreamingTextOptions = {}
) {
  const { speed = 10, cursor = true } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const indexRef = useRef(0);
  const previousTextRef = useRef('');

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(text);
      setIsComplete(true);
      indexRef.current = text.length;
      previousTextRef.current = text;
      return;
    }

    const hasNewContent = text.length > previousTextRef.current.length;

    if (hasNewContent) {
      const startIndex = previousTextRef.current.length;
      const newChars = text.slice(startIndex);
      let charIndex = 0;

      const streamNextChar = () => {
        if (charIndex < newChars.length) {
          setDisplayedText(
            () => previousTextRef.current + newChars.slice(0, charIndex + 1)
          );
          charIndex++;
          timeoutRef.current = setTimeout(streamNextChar, speed);
        } else {
          previousTextRef.current = text;
          setDisplayedText(text);
          setIsComplete(true);
        }
      };

      streamNextChar();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, isStreaming, speed]);

  return {
    displayedText,
    isComplete,
    isStreaming: isStreaming && !isComplete,
    cursorVisible: cursor && isStreaming && !isComplete,
  };
}
