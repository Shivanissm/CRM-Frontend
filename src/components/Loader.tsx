import './Loader.css';

interface LoaderProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
}

export default function Loader({ message = 'Loading...', size = 'medium' }: LoaderProps) {
  return (
    <div className={`loader-container loader-${size}`}>
      <div className="loader-spinner"></div>
      {message && <div className="loader-message">{message}</div>}
    </div>
  );
}

