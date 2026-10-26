import { motion } from 'framer-motion';
import { Upload, CheckCircle } from 'lucide-react';

interface UploadProgressProps {
  progress: number;
  fileName: string;
  fileSize: string;
  isComplete?: boolean;
}

export function UploadProgress({ progress, fileName, fileSize, isComplete = false }: UploadProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-secondary/50 rounded-lg p-4"
    >
      <div className="flex items-center gap-3 mb-2">
        {isComplete ? (
          <CheckCircle className="h-5 w-5 text-success" />
        ) : (
          <Upload className="h-5 w-5 text-primary animate-pulse" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground">{fileSize}</p>
        </div>
        <span className="text-sm font-medium text-primary">{progress}%</span>
      </div>
      
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload limits
export const UPLOAD_LIMITS = {
  image: 50 * 1024 * 1024, // 50 MB
  video: 500 * 1024 * 1024, // 500 MB
};

export const ALLOWED_FORMATS = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  video: ['video/mp4', 'video/quicktime', 'video/mov'],
};

export function validateFile(file: File, type: 'image' | 'video'): { valid: boolean; error?: string } {
  const maxSize = UPLOAD_LIMITS[type];
  const allowedTypes = ALLOWED_FORMATS[type];

  if (!allowedTypes.some(t => file.type.includes(t.split('/')[1]))) {
    return {
      valid: false,
      error: `Invalid file format. Allowed: ${type === 'image' ? 'JPG, PNG, WEBP' : 'MP4, MOV'}`,
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum: ${type === 'image' ? '50 MB' : '500 MB'}`,
    };
  }

  return { valid: true };
}
