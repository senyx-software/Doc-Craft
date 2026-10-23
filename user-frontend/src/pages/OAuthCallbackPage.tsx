import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {useAuthStore} from '../store/authStore';

export default function OAuthCallbackPage(){
  const started=useRef(false),navigate=useNavigate();
  const [error,setError]=useState<string|null>(()=>{const p=new URLSearchParams(window.location.hash.slice(1));return Boolean(p.get('accessToken'))===Boolean(p.get('mfaToken'))?'Invalid sign-in response. Please start again.':null;});
  useEffect(()=>{
    if(started.current)return;
    started.current=true;
    const params=new URLSearchParams(window.location.hash.slice(1));
    // Remove credentials immediately, before requests, navigation or history entries.
    window.history.replaceState({},'',window.location.pathname);
    const token=params.get('accessToken'),mfa=params.get('mfaToken');
    if(mfa&&!token){
      useAuthStore.setState({mfaToken:mfa,isInitializing:false,isAuthenticated:false});
      navigate('/login',{replace:true});return;
    }
    if(!token||mfa)return;
    useAuthStore.getState().setToken(token);
    void useAuthStore.getState().checkAuth().then(()=>{
      if(useAuthStore.getState().isAuthenticated)navigate('/dashboard',{replace:true});
      else setError('Sign-in could not be verified. Please start again.');
    });
  },[navigate]);
  return <div className="p-8" role={error?'alert':'status'}>{error||'Completing sign-in…'}{error&&<Link className="block underline" to="/login">Return to sign in</Link>}</div>;
}
