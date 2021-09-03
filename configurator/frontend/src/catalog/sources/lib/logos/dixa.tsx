import * as React from "react";

function Svg(props) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="250" height="250" fill="white"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M143.515 126.356L129.608 134.158C128.374 134.855 126.867 134.437 126.182 133.253L110.15 106.016C109.397 104.832 109.877 103.369 111.041 102.673L124.949 94.8708C133.855 89.8556 145.159 92.7811 150.298 101.488C152.01 104.344 152.764 107.479 152.764 110.544C152.764 116.813 149.475 122.943 143.515 126.356ZM182.429 83.3076C167.083 57.1858 133.033 48.2695 106.383 63.3853L62.5357 88.1837C60.1378 89.577 59.3157 92.5723 60.6859 94.9406L98.7093 159.444C99.5315 160.837 99.9425 162.37 99.9425 163.972V190.79C99.9425 191.765 101.039 192.392 101.929 191.905L113.85 185.148L122.003 180.55L162.082 157.842C179.894 147.741 189.897 129.352 189.897 110.544C189.897 101.279 187.499 91.8755 182.429 83.3076Z" fill="#5A41E1"/>
    </svg>
  );
}

export default Svg;