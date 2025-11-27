# Deployment Guide

## Environment Variables

For production deployment, you need to set the following environment variable:

### `VITE_API_BASE_URL`

This should be set to your backend API base URL (without trailing slash).

**Example:**
```bash
VITE_API_BASE_URL=https://api.yourdomain.com
```

Or if your backend is on the same domain:
```bash
VITE_API_BASE_URL=https://yourdomain.com
```

## CORS Configuration

CORS (Cross-Origin Resource Sharing) errors occur when the backend server doesn't allow requests from the frontend's origin. This is a **backend configuration issue** that must be fixed on the server side.

### Backend Requirements

Your backend server must:

1. **Allow the frontend origin** in CORS configuration
2. **Include proper CORS headers** in responses:
   - `Access-Control-Allow-Origin: <frontend-domain>`
   - `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
   - `Access-Control-Allow-Headers: Content-Type, Authorization`
   - `Access-Control-Allow-Credentials: true` (if using cookies)

### Example Backend CORS Configuration (Spring Boot)

```java
@Configuration
public class CorsConfig {
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                    .allowedOrigins("https://your-frontend-domain.com")
                    .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                    .allowedHeaders("*")
                    .allowCredentials(true);
            }
        };
    }
}
```

### Troubleshooting CORS Errors

If you're seeing CORS errors in production:

1. **Check environment variable**: Ensure `VITE_API_BASE_URL` is set correctly
2. **Verify backend CORS configuration**: The backend must allow your frontend domain
3. **Check browser console**: Look for the exact error message and which origin is being blocked
4. **Test API directly**: Use tools like Postman or curl to verify the backend is accessible
5. **Check network tab**: Verify the actual request URL and headers being sent

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Environment Variables in Production

For different deployment platforms:

### Vercel
Add environment variables in the Vercel dashboard under Project Settings > Environment Variables

### Netlify
Add environment variables in the Netlify dashboard under Site Settings > Build & Deploy > Environment

### Docker
```dockerfile
ENV VITE_API_BASE_URL=https://api.yourdomain.com
```

### Static Hosting
Set environment variables during build:
```bash
VITE_API_BASE_URL=https://api.yourdomain.com npm run build
```

