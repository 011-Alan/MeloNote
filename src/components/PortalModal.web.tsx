import React, { useEffect, useRef } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';

interface PortalModalProps {
  children: React.ReactNode;
  visible: boolean;
  onRequestClose?: () => void;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
}

export default function PortalModal({
  children,
  visible,
  onRequestClose,
}: PortalModalProps) {
  const wasVisible = useRef(false);

  // Log "OPENING MODAL" when transitioning to visible
  if (visible && !wasVisible.current) {
    console.log("OPENING MODAL");
    wasVisible.current = true;
  }

  // Log "MODAL MOUNTED" and "MODAL VISIBLE"
  useEffect(() => {
    if (visible) {
      console.log("MODAL MOUNTED");
      console.log("MODAL VISIBLE");
    }
  }, [visible]);

  // Log "MODAL CLOSED" when transitioning from visible to hidden
  useEffect(() => {
    if (!visible && wasVisible.current) {
      console.log("MODAL CLOSED");
      wasVisible.current = false;
    }
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    children,
    document.body
  );
}
