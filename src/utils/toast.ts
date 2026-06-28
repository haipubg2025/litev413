import React from 'react';
import { toast as sonnerToast, ExternalToast } from 'sonner';
import { useStore } from '../store/useStore';

const logToast = (message: string | React.ReactNode, data?: ExternalToast) => {
    let textMessage = "";
    if (typeof message === 'string') {
        textMessage = message;
    } else {
        textMessage = "New Notification";
    }
    
    if (data && data.description && typeof data.description === 'string') {
        textMessage += `\n> ${data.description}`;
    }
    
    useStore.getState().setSystemLogs(`[Notification] ${textMessage}`);
};

export const toast = Object.assign((message: string | React.ReactNode, data?: ExternalToast) => {
  logToast(message, data);
  return sonnerToast(message, data);
}, {
  success: (message: string | React.ReactNode, data?: ExternalToast) => {
    logToast(message, data);
    return sonnerToast.success(message, data);
  },
  error: (message: string | React.ReactNode, data?: ExternalToast) => {
    logToast(message, data);
    return sonnerToast.error(message, data);
  },
  warning: (message: string | React.ReactNode, data?: ExternalToast) => {
    logToast(message, data);
    return sonnerToast.warning(message, data);
  },
  info: (message: string | React.ReactNode, data?: ExternalToast) => {
    logToast(message, data);
    return sonnerToast.info(message, data);
  },
  promise: sonnerToast.promise,
  custom: sonnerToast.custom,
  dismiss: sonnerToast.dismiss,
});
