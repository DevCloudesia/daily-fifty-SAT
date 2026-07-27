import './home.css';
export const metadata={title:'The Daily Fifty',description:'Focused daily SAT practice'};
export const viewport={width:'device-width',initialScale:1,themeColor:'#ffffff'};
export default function Layout({children}){return <html lang="en"><body>{children}</body></html>}
