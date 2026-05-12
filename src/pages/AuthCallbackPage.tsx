import { useEffect, useState } from "react";
import { IonContent, IonPage, IonSpinner, IonText } from "@ionic/react";
import { useHistory } from "react-router";
import { supabase } from "../lib/supabaseClient";

const AuthCallbackPage: React.FC = () => {
  const history = useHistory();
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function resolveSession() {
      try {
        const debugLines: string[] = [];
        debugLines.push("[AuthCallback] Mount - resolving session");
        
        // Log current URL and search/hash
        debugLines.push(`Current URL: ${window.location.href}`);
        debugLines.push(`Search: ${window.location.search}`);
        debugLines.push(`Hash: ${window.location.hash}`);
        
        if (!supabase) {
          const msg = "Supabase not configured";
          console.error("[AuthCallback]", msg);
          debugLines.push(msg);
          setDebug(debugLines.join("\n"));
          setError("Supabase not configured");
          return;
        }

        // Check if there's an auth code in search params (fallback for path-based redirects)
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("code");
        const error_description = searchParams.get("error_description");
        
        if (error_description) {
          const msg = `OAuth error: ${error_description}`;
          debugLines.push(msg);
          console.error("[AuthCallback]", msg);
          setDebug(debugLines.join("\n"));
          setError(msg);
          return;
        }

        if (code) {
          debugLines.push(`Found auth code in URL, exchanging...`);
          console.log("[AuthCallback] Found auth code, exchanging for session");
          // Auth code is present - Supabase should handle this automatically with detectSessionInUrl
        }

        debugLines.push("[AuthCallback] Calling getSession()...");
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("[AuthCallback] Session error:", sessionError);
          debugLines.push(`Session error: ${sessionError.message}`);
          setDebug(debugLines.join("\n"));
          setError(`Session error: ${sessionError.message}`);
          return;
        }

        const hasSession = !!data?.session;
        debugLines.push(`Session found: ${hasSession}`);
        if (hasSession) {
          debugLines.push(`User ID: ${data.session!.user.id}`);
        }
        console.log("[AuthCallback] Session result:", data?.session ? "Session found" : "No session", data?.session);

        if (!cancelled) {
          if (!hasSession) {
            // No session found - try to wait a bit for async processing
            debugLines.push("No session detected, waiting before retry...");
            setDebug(debugLines.join("\n"));
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (cancelled) return;
            
            // Try again
            const { data: retryData, error: retryError } = await supabase.auth.getSession();
            if (!retryError && retryData?.session) {
              debugLines.push("Session found on retry!");
              console.log("[AuthCallback] Session found on retry");
              const returnTo = localStorage.getItem("url-qr-stl.return-to") ?? "/editor";
              localStorage.removeItem("url-qr-stl.return-to");
              debugLines.push(`Redirecting to: ${returnTo}`);
              setDebug(debugLines.join("\n"));
              setTimeout(() => {
                if (!cancelled) {
                  history.replace(returnTo);
                }
              }, 100);
              return;
            }
          }

          const returnTo = localStorage.getItem("url-qr-stl.return-to") ?? "/editor";
          localStorage.removeItem("url-qr-stl.return-to");
          debugLines.push(`Redirecting to: ${returnTo}`);
          setDebug(debugLines.join("\n"));
          console.log("[AuthCallback] Redirecting to:", returnTo);
          
          // Small delay to ensure session is properly stored
          setTimeout(() => {
            if (!cancelled) {
              history.replace(returnTo);
            }
          }, 100);
        }
      } catch (err) {
        console.error("[AuthCallback] Unexpected error:", err);
        const msg = err instanceof Error ? err.message : "Unknown error during sign-in";
        setDebug(`[AuthCallback] Error: ${msg}\n${err instanceof Error ? err.stack : ""}`);
        setError(msg);
      }
    }

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, [history]);

  if (error) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonText color="danger">
            <p><strong>Error signing in:</strong> {error}</p>
            {debug && (
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.85rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {debug}
              </div>
            )}
            <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
              Check browser console (F12) for more details.
              <a href="/#/auth" style={{ marginLeft: "0.5rem" }}>
                Back to login
              </a>
            </p>
          </IonText>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <IonSpinner />
        <IonText>
          <p>Signing you in...</p>
        </IonText>
      </IonContent>
    </IonPage>
  );
};

export default AuthCallbackPage;
