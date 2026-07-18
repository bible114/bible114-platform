import{L as wi,g as Ti,i as Ei,a as It,_ as Jt,C as dt,r as Yt,b as vn,S as ke,E as yt,c as _,d as p,e as ki,f as In,h as w,F as z,j as Ri,q as ae,k as ee,l as fe,m as yn,n as Pi,o as bi,p as wt,s as wn,t as lt}from"./vendor-firebase-core-CD9lI5Ki.js";import{_ as Tt}from"./vendor-Bg_btqvK.js";const ue={FACEBOOK:"facebook.com",GITHUB:"github.com",GOOGLE:"google.com",PASSWORD:"password",TWITTER:"twitter.com"},Z={EMAIL_SIGNIN:"EMAIL_SIGNIN",PASSWORD_RESET:"PASSWORD_RESET",RECOVER_EMAIL:"RECOVER_EMAIL",REVERT_SECOND_FACTOR_ADDITION:"REVERT_SECOND_FACTOR_ADDITION",VERIFY_AND_CHANGE_EMAIL:"VERIFY_AND_CHANGE_EMAIL",VERIFY_EMAIL:"VERIFY_EMAIL"};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ai(){return{"admin-restricted-operation":"This operation is restricted to administrators only.","argument-error":"","app-not-authorized":"This app, identified by the domain where it's hosted, is not authorized to use Firebase Authentication with the provided API key. Review your key configuration in the Google API console.","app-not-installed":"The requested mobile application corresponding to the identifier (Android package name or iOS bundle ID) provided is not installed on this device.","captcha-check-failed":"The reCAPTCHA response token provided is either invalid, expired, already used or the domain associated with it does not match the list of whitelisted domains.","code-expired":"The SMS code has expired. Please re-send the verification code to try again.","cordova-not-ready":"Cordova framework is not ready.","cors-unsupported":"This browser is not supported.","credential-already-in-use":"This credential is already associated with a different user account.","custom-token-mismatch":"The custom token corresponds to a different audience.","requires-recent-login":"This operation is sensitive and requires recent authentication. Log in again before retrying this request.","dependent-sdk-initialized-before-auth":"Another Firebase SDK was initialized and is trying to use Auth before Auth is initialized. Please be sure to call `initializeAuth` or `getAuth` before starting any other Firebase SDK.","dynamic-link-not-activated":"Please activate Dynamic Links in the Firebase Console and agree to the terms and conditions.","email-change-needs-verification":"Multi-factor users must always have a verified email.","email-already-in-use":"The email address is already in use by another account.","emulator-config-failed":'Auth instance has already been used to make a network call. Auth can no longer be configured to use the emulator. Try calling "connectAuthEmulator()" sooner.',"expired-action-code":"The action code has expired.","cancelled-popup-request":"This operation has been cancelled due to another conflicting popup being opened.","internal-error":"An internal AuthError has occurred.","invalid-app-credential":"The phone verification request contains an invalid application verifier. The reCAPTCHA token response is either invalid or expired.","invalid-app-id":"The mobile app identifier is not registered for the current project.","invalid-user-token":"This user's credential isn't valid for this project. This can happen if the user's token has been tampered with, or if the user isn't for the project associated with this API key.","invalid-auth-event":"An internal AuthError has occurred.","invalid-verification-code":"The SMS verification code used to create the phone auth credential is invalid. Please resend the verification code sms and be sure to use the verification code provided by the user.","invalid-continue-uri":"The continue URL provided in the request is invalid.","invalid-cordova-configuration":"The following Cordova plugins must be installed to enable OAuth sign-in: cordova-plugin-buildinfo, cordova-universal-links-plugin, cordova-plugin-browsertab, cordova-plugin-inappbrowser and cordova-plugin-customurlscheme.","invalid-custom-token":"The custom token format is incorrect. Please check the documentation.","invalid-dynamic-link-domain":"The provided dynamic link domain is not configured or authorized for the current project.","invalid-email":"The email address is badly formatted.","invalid-emulator-scheme":"Emulator URL must start with a valid scheme (http:// or https://).","invalid-api-key":"Your API key is invalid, please check you have copied it correctly.","invalid-cert-hash":"The SHA-1 certificate hash provided is invalid.","invalid-credential":"The supplied auth credential is incorrect, malformed or has expired.","invalid-message-payload":"The email template corresponding to this action contains invalid characters in its message. Please fix by going to the Auth email templates section in the Firebase Console.","invalid-multi-factor-session":"The request does not contain a valid proof of first factor successful sign-in.","invalid-oauth-provider":"EmailAuthProvider is not supported for this operation. This operation only supports OAuth providers.","invalid-oauth-client-id":"The OAuth client ID provided is either invalid or does not match the specified API key.","unauthorized-domain":"This domain is not authorized for OAuth operations for your Firebase project. Edit the list of authorized domains from the Firebase console.","invalid-action-code":"The action code is invalid. This can happen if the code is malformed, expired, or has already been used.","wrong-password":"The password is invalid or the user does not have a password.","invalid-persistence-type":"The specified persistence type is invalid. It can only be local, session or none.","invalid-phone-number":"The format of the phone number provided is incorrect. Please enter the phone number in a format that can be parsed into E.164 format. E.164 phone numbers are written in the format [+][country code][subscriber number including area code].","invalid-provider-id":"The specified provider ID is invalid.","invalid-recipient-email":"The email corresponding to this action failed to send as the provided recipient email address is invalid.","invalid-sender":"The email template corresponding to this action contains an invalid sender email or name. Please fix by going to the Auth email templates section in the Firebase Console.","invalid-verification-id":"The verification ID used to create the phone auth credential is invalid.","invalid-tenant-id":"The Auth instance's tenant ID is invalid.","login-blocked":"Login blocked by user-provided method: {$originalMessage}","missing-android-pkg-name":"An Android Package Name must be provided if the Android App is required to be installed.","auth-domain-config-required":"Be sure to include authDomain when calling firebase.initializeApp(), by following the instructions in the Firebase console.","missing-app-credential":"The phone verification request is missing an application verifier assertion. A reCAPTCHA response token needs to be provided.","missing-verification-code":"The phone auth credential was created with an empty SMS verification code.","missing-continue-uri":"A continue URL must be provided in the request.","missing-iframe-start":"An internal AuthError has occurred.","missing-ios-bundle-id":"An iOS Bundle ID must be provided if an App Store ID is provided.","missing-or-invalid-nonce":"The request does not contain a valid nonce. This can occur if the SHA-256 hash of the provided raw nonce does not match the hashed nonce in the ID token payload.","missing-password":"A non-empty password must be provided","missing-multi-factor-info":"No second factor identifier is provided.","missing-multi-factor-session":"The request is missing proof of first factor successful sign-in.","missing-phone-number":"To send verification codes, provide a phone number for the recipient.","missing-verification-id":"The phone auth credential was created with an empty verification ID.","app-deleted":"This instance of FirebaseApp has been deleted.","multi-factor-info-not-found":"The user does not have a second factor matching the identifier provided.","multi-factor-auth-required":"Proof of ownership of a second factor is required to complete sign-in.","account-exists-with-different-credential":"An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.","network-request-failed":"A network AuthError (such as timeout, interrupted connection or unreachable host) has occurred.","no-auth-event":"An internal AuthError has occurred.","no-such-provider":"User was not linked to an account with the given provider.","null-user":"A null user object was provided as the argument for an operation which requires a non-null user object.","operation-not-allowed":"The given sign-in provider is disabled for this Firebase project. Enable it in the Firebase console, under the sign-in method tab of the Auth section.","operation-not-supported-in-this-environment":'This operation is not supported in the environment this application is running on. "location.protocol" must be http, https or chrome-extension and web storage must be enabled.',"popup-blocked":"Unable to establish a connection with the popup. It may have been blocked by the browser.","popup-closed-by-user":"The popup has been closed by the user before finalizing the operation.","provider-already-linked":"User can only be linked to one identity for the given provider.","quota-exceeded":"The project's quota for this operation has been exceeded.","redirect-cancelled-by-user":"The redirect operation has been cancelled by the user before finalizing.","redirect-operation-pending":"A redirect sign-in operation is already pending.","rejected-credential":"The request contains malformed or mismatching credentials.","second-factor-already-in-use":"The second factor is already enrolled on this account.","maximum-second-factor-count-exceeded":"The maximum allowed number of second factors on a user has been exceeded.","tenant-id-mismatch":"The provided tenant ID does not match the Auth instance's tenant ID",timeout:"The operation has timed out.","user-token-expired":"The user's credential is no longer valid. The user must sign in again.","too-many-requests":"We have blocked all requests from this device due to unusual activity. Try again later.","unauthorized-continue-uri":"The domain of the continue URL is not whitelisted.  Please whitelist the domain in the Firebase console.","unsupported-first-factor":"Enrolling a second factor or signing in with a multi-factor account requires sign-in with a supported first factor.","unsupported-persistence-type":"The current environment does not support the specified persistence type.","unsupported-tenant-operation":"This operation is not supported in a multi-tenant context.","unverified-email":"The operation requires a verified email.","user-cancelled":"The user did not grant your application the permissions it requested.","user-not-found":"There is no user record corresponding to this identifier. The user may have been deleted.","user-disabled":"The user account has been disabled by an administrator.","user-mismatch":"The supplied credentials do not correspond to the previously signed in user.","user-signed-out":"","weak-password":"The password must be 6 characters long or more.","web-storage-unsupported":"This browser is not supported or 3rd party cookies and data may be disabled.","already-initialized":"initializeAuth() has already been called with different options. To avoid this error, call initializeAuth() with the same options as when it was originally called, or call getAuth() to return the already initialized instance.","missing-recaptcha-token":"The reCAPTCHA token is missing when sending request to the backend.","invalid-recaptcha-token":"The reCAPTCHA token is invalid when sending request to the backend.","invalid-recaptcha-action":"The reCAPTCHA action is invalid when sending request to the backend.","recaptcha-not-enabled":"reCAPTCHA Enterprise integration is not enabled for this project.","missing-client-type":"The reCAPTCHA client type is missing when sending request to the backend.","missing-recaptcha-version":"The reCAPTCHA version is missing when sending request to the backend.","invalid-req-type":"Invalid request parameters.","invalid-recaptcha-version":"The reCAPTCHA version is invalid when sending request to the backend.","unsupported-password-policy-schema-version":"The password policy received from the backend uses a schema version that is not supported by this version of the Firebase SDK.","password-does-not-meet-requirements":"The password does not meet the requirements."}}function Tn(){return{"dependent-sdk-initialized-before-auth":"Another Firebase SDK was initialized and is trying to use Auth before Auth is initialized. Please be sure to call `initializeAuth` or `getAuth` before starting any other Firebase SDK."}}const Si=Ai,Ci=Tn,En=new yt("auth","Firebase",Tn());/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const We=new wi("@firebase/auth");function Ni(n,...e){We.logLevel<=In.WARN&&We.warn(`Auth (${ke}): ${n}`,...e)}function Ue(n,...e){We.logLevel<=In.ERROR&&We.error(`Auth (${ke}): ${n}`,...e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function T(n,...e){throw kt(n,...e)}function I(n,...e){return kt(n,...e)}function Et(n,e,t){const i=Object.assign(Object.assign({},Ci()),{[e]:t});return new yt("auth","Firebase",i).create(e,{appName:n.name})}function y(n){return Et(n,"operation-not-supported-in-this-environment","Operations that alter the current user are not supported in conjunction with FirebaseServerApp")}function ce(n,e,t){const i=t;if(!(e instanceof i))throw i.name!==e.constructor.name&&T(n,"argument-error"),Et(n,"argument-error",`Type of ${e.constructor.name} does not match expected instance.Did you pass a reference from a different Auth SDK?`)}function kt(n,...e){if(typeof n!="string"){const t=e[0],i=[...e.slice(1)];return i[0]&&(i[0].appName=n.name),n._errorFactory.create(t,...i)}return En.create(n,...e)}function d(n,e,...t){if(!n)throw kt(e,...t)}function L(n){const e="INTERNAL ASSERTION FAILED: "+n;throw Ue(e),new Error(e)}function A(n,e){n||L(e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ie(){var n;return typeof self<"u"&&((n=self.location)===null||n===void 0?void 0:n.href)||""}function Rt(){return Xt()==="http:"||Xt()==="https:"}function Xt(){var n;return typeof self<"u"&&((n=self.location)===null||n===void 0?void 0:n.protocol)||null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Oi(){return typeof navigator<"u"&&navigator&&"onLine"in navigator&&typeof navigator.onLine=="boolean"&&(Rt()||vn()||"connection"in navigator)?navigator.onLine:!0}function Li(){if(typeof navigator>"u")return null;const n=navigator;return n.languages&&n.languages[0]||n.language||null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Re{constructor(e,t){this.shortDelay=e,this.longDelay=t,A(t>e,"Short delay should be less than long delay!"),this.isMobile=Ei()||It()}get(){return Oi()?this.isMobile?this.longDelay:this.shortDelay:Math.min(5e3,this.shortDelay)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Pt(n,e){A(n.emulator,"Emulator should always be set here");const{url:t}=n.emulator;return e?`${t}${e.startsWith("/")?e.slice(1):e}`:t}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class kn{static initialize(e,t,i){this.fetchImpl=e,t&&(this.headersImpl=t),i&&(this.responseImpl=i)}static fetch(){if(this.fetchImpl)return this.fetchImpl;if(typeof self<"u"&&"fetch"in self)return self.fetch;if(typeof globalThis<"u"&&globalThis.fetch)return globalThis.fetch;if(typeof fetch<"u")return fetch;L("Could not find fetch implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static headers(){if(this.headersImpl)return this.headersImpl;if(typeof self<"u"&&"Headers"in self)return self.Headers;if(typeof globalThis<"u"&&globalThis.Headers)return globalThis.Headers;if(typeof Headers<"u")return Headers;L("Could not find Headers implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static response(){if(this.responseImpl)return this.responseImpl;if(typeof self<"u"&&"Response"in self)return self.Response;if(typeof globalThis<"u"&&globalThis.Response)return globalThis.Response;if(typeof Response<"u")return Response;L("Could not find Response implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Di={CREDENTIAL_MISMATCH:"custom-token-mismatch",MISSING_CUSTOM_TOKEN:"internal-error",INVALID_IDENTIFIER:"invalid-email",MISSING_CONTINUE_URI:"internal-error",INVALID_PASSWORD:"wrong-password",MISSING_PASSWORD:"missing-password",INVALID_LOGIN_CREDENTIALS:"invalid-credential",EMAIL_EXISTS:"email-already-in-use",PASSWORD_LOGIN_DISABLED:"operation-not-allowed",INVALID_IDP_RESPONSE:"invalid-credential",INVALID_PENDING_TOKEN:"invalid-credential",FEDERATED_USER_ID_ALREADY_LINKED:"credential-already-in-use",MISSING_REQ_TYPE:"internal-error",EMAIL_NOT_FOUND:"user-not-found",RESET_PASSWORD_EXCEED_LIMIT:"too-many-requests",EXPIRED_OOB_CODE:"expired-action-code",INVALID_OOB_CODE:"invalid-action-code",MISSING_OOB_CODE:"internal-error",CREDENTIAL_TOO_OLD_LOGIN_AGAIN:"requires-recent-login",INVALID_ID_TOKEN:"invalid-user-token",TOKEN_EXPIRED:"user-token-expired",USER_NOT_FOUND:"user-token-expired",TOO_MANY_ATTEMPTS_TRY_LATER:"too-many-requests",PASSWORD_DOES_NOT_MEET_REQUIREMENTS:"password-does-not-meet-requirements",INVALID_CODE:"invalid-verification-code",INVALID_SESSION_INFO:"invalid-verification-id",INVALID_TEMPORARY_PROOF:"invalid-credential",MISSING_SESSION_INFO:"missing-verification-id",SESSION_EXPIRED:"code-expired",MISSING_ANDROID_PACKAGE_NAME:"missing-android-pkg-name",UNAUTHORIZED_DOMAIN:"unauthorized-continue-uri",INVALID_OAUTH_CLIENT_ID:"invalid-oauth-client-id",ADMIN_ONLY_OPERATION:"admin-restricted-operation",INVALID_MFA_PENDING_CREDENTIAL:"invalid-multi-factor-session",MFA_ENROLLMENT_NOT_FOUND:"multi-factor-info-not-found",MISSING_MFA_ENROLLMENT_ID:"missing-multi-factor-info",MISSING_MFA_PENDING_CREDENTIAL:"missing-multi-factor-session",SECOND_FACTOR_EXISTS:"second-factor-already-in-use",SECOND_FACTOR_LIMIT_EXCEEDED:"maximum-second-factor-count-exceeded",BLOCKING_FUNCTION_ERROR_RESPONSE:"internal-error",RECAPTCHA_NOT_ENABLED:"recaptcha-not-enabled",MISSING_RECAPTCHA_TOKEN:"missing-recaptcha-token",INVALID_RECAPTCHA_TOKEN:"invalid-recaptcha-token",INVALID_RECAPTCHA_ACTION:"invalid-recaptcha-action",MISSING_CLIENT_TYPE:"missing-client-type",MISSING_RECAPTCHA_VERSION:"missing-recaptcha-version",INVALID_RECAPTCHA_VERSION:"invalid-recaptcha-version",INVALID_REQ_TYPE:"invalid-req-type"};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ui=new Re(3e4,6e4);function m(n,e){return n.tenantId&&!e.tenantId?Object.assign(Object.assign({},e),{tenantId:n.tenantId}):e}async function g(n,e,t,i,r={}){return Rn(n,r,async()=>{let s={},o={};i&&(e==="GET"?o=i:s={body:JSON.stringify(i)});const a=ae(Object.assign({key:n.config.apiKey},o)).slice(1),c=await n._getAdditionalHeaders();c["Content-Type"]="application/json",n.languageCode&&(c["X-Firebase-Locale"]=n.languageCode);const l=Object.assign({method:e,headers:c},s);return bi()||(l.referrerPolicy="no-referrer"),kn.fetch()(Pn(n,n.config.apiHost,t,a),l)})}async function Rn(n,e,t){n._canInitEmulator=!1;const i=Object.assign(Object.assign({},Di),e);try{const r=new Fi(n),s=await Promise.race([t(),r.promise]);r.clearNetworkTimeout();const o=await s.json();if("needConfirmation"in o)throw me(n,"account-exists-with-different-credential",o);if(s.ok&&!("errorMessage"in o))return o;{const a=s.ok?o.errorMessage:o.error.message,[c,l]=a.split(" : ");if(c==="FEDERATED_USER_ID_ALREADY_LINKED")throw me(n,"credential-already-in-use",o);if(c==="EMAIL_EXISTS")throw me(n,"email-already-in-use",o);if(c==="USER_DISABLED")throw me(n,"user-disabled",o);const u=i[c]||c.toLowerCase().replace(/[_\s]+/g,"-");if(l)throw Et(n,u,l);T(n,u)}}catch(r){if(r instanceof z)throw r;T(n,"network-request-failed",{message:String(r)})}}async function x(n,e,t,i,r={}){const s=await g(n,e,t,i,r);return"mfaPendingCredential"in s&&T(n,"multi-factor-auth-required",{_serverResponse:s}),s}function Pn(n,e,t,i){const r=`${e}${t}?${i}`;return n.config.emulator?Pt(n.config,r):`${n.config.apiScheme}://${r}`}function Mi(n){switch(n){case"ENFORCE":return"ENFORCE";case"AUDIT":return"AUDIT";case"OFF":return"OFF";default:return"ENFORCEMENT_STATE_UNSPECIFIED"}}class Fi{constructor(e){this.auth=e,this.timer=null,this.promise=new Promise((t,i)=>{this.timer=setTimeout(()=>i(I(this.auth,"network-request-failed")),Ui.get())})}clearNetworkTimeout(){clearTimeout(this.timer)}}function me(n,e,t){const i={appName:n.name};t.email&&(i.email=t.email),t.phoneNumber&&(i.phoneNumber=t.phoneNumber);const r=I(n,e,i);return r.customData._tokenResponse=t,r}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Qt(n){return n!==void 0&&n.getResponse!==void 0}function Zt(n){return n!==void 0&&n.enterprise!==void 0}class Vi{constructor(e){if(this.siteKey="",this.recaptchaEnforcementState=[],e.recaptchaKey===void 0)throw new Error("recaptchaKey undefined");this.siteKey=e.recaptchaKey.split("/")[3],this.recaptchaEnforcementState=e.recaptchaEnforcementState}getProviderEnforcementState(e){if(!this.recaptchaEnforcementState||this.recaptchaEnforcementState.length===0)return null;for(const t of this.recaptchaEnforcementState)if(t.provider&&t.provider===e)return Mi(t.enforcementState);return null}isProviderEnabled(e){return this.getProviderEnforcementState(e)==="ENFORCE"||this.getProviderEnforcementState(e)==="AUDIT"}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Wi(n){return(await g(n,"GET","/v1/recaptchaParams")).recaptchaSiteKey||""}async function xi(n,e){return g(n,"GET","/v2/recaptchaConfig",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Hi(n,e){return g(n,"POST","/v1/accounts:delete",e)}async function qi(n,e){return g(n,"POST","/v1/accounts:update",e)}async function bn(n,e){return g(n,"POST","/v1/accounts:lookup",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ge(n){if(n)try{const e=new Date(Number(n));if(!isNaN(e.getTime()))return e.toUTCString()}catch{}}async function ji(n,e=!1){const t=p(n),i=await t.getIdToken(e),r=ze(i);d(r&&r.exp&&r.auth_time&&r.iat,t.auth,"internal-error");const s=typeof r.firebase=="object"?r.firebase:void 0,o=s==null?void 0:s.sign_in_provider;return{claims:r,token:i,authTime:ge(rt(r.auth_time)),issuedAtTime:ge(rt(r.iat)),expirationTime:ge(rt(r.exp)),signInProvider:o||null,signInSecondFactor:(s==null?void 0:s.sign_in_second_factor)||null}}function rt(n){return Number(n)*1e3}function ze(n){const[e,t,i]=n.split(".");if(e===void 0||t===void 0||i===void 0)return Ue("JWT malformed, contained fewer than 3 sections"),null;try{const r=Ri(t);return r?JSON.parse(r):(Ue("Failed to decode base64 JWT payload"),null)}catch(r){return Ue("Caught error parsing JWT payload as JSON",r==null?void 0:r.toString()),null}}function en(n){const e=ze(n);return d(e,"internal-error"),d(typeof e.exp<"u","internal-error"),d(typeof e.iat<"u","internal-error"),Number(e.exp)-Number(e.iat)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function W(n,e,t=!1){if(t)return e;try{return await e}catch(i){throw i instanceof z&&zi(i)&&n.auth.currentUser===n&&await n.auth.signOut(),i}}function zi({code:n}){return n==="auth/user-disabled"||n==="auth/user-token-expired"}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Gi{constructor(e){this.user=e,this.isRunning=!1,this.timerId=null,this.errorBackoff=3e4}_start(){this.isRunning||(this.isRunning=!0,this.schedule())}_stop(){this.isRunning&&(this.isRunning=!1,this.timerId!==null&&clearTimeout(this.timerId))}getInterval(e){var t;if(e){const i=this.errorBackoff;return this.errorBackoff=Math.min(this.errorBackoff*2,96e4),i}else{this.errorBackoff=3e4;const r=((t=this.user.stsTokenManager.expirationTime)!==null&&t!==void 0?t:0)-Date.now()-3e5;return Math.max(0,r)}}schedule(e=!1){if(!this.isRunning)return;const t=this.getInterval(e);this.timerId=setTimeout(async()=>{await this.iteration()},t)}async iteration(){try{await this.user.getIdToken(!0)}catch(e){(e==null?void 0:e.code)==="auth/network-request-failed"&&this.schedule(!0);return}this.schedule()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ut{constructor(e,t){this.createdAt=e,this.lastLoginAt=t,this._initializeTime()}_initializeTime(){this.lastSignInTime=ge(this.lastLoginAt),this.creationTime=ge(this.createdAt)}_copy(e){this.createdAt=e.createdAt,this.lastLoginAt=e.lastLoginAt,this._initializeTime()}toJSON(){return{createdAt:this.createdAt,lastLoginAt:this.lastLoginAt}}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ye(n){var e;const t=n.auth,i=await n.getIdToken(),r=await W(n,bn(t,{idToken:i}));d(r==null?void 0:r.users.length,t,"internal-error");const s=r.users[0];n._notifyReloadListener(s);const o=!((e=s.providerUserInfo)===null||e===void 0)&&e.length?An(s.providerUserInfo):[],a=$i(n.providerData,o),c=n.isAnonymous,l=!(n.email&&s.passwordHash)&&!(a!=null&&a.length),u=c?l:!1,h={uid:s.localId,displayName:s.displayName||null,photoURL:s.photoUrl||null,email:s.email||null,emailVerified:s.emailVerified||!1,phoneNumber:s.phoneNumber||null,tenantId:s.tenantId||null,providerData:a,metadata:new ut(s.createdAt,s.lastLoginAt),isAnonymous:u};Object.assign(n,h)}async function Bi(n){const e=p(n);await ye(e),await e.auth._persistUserIfCurrent(e),e.auth._notifyListenersIfCurrent(e)}function $i(n,e){return[...n.filter(i=>!e.some(r=>r.providerId===i.providerId)),...e]}function An(n){return n.map(e=>{var{providerId:t}=e,i=Tt(e,["providerId"]);return{providerId:t,uid:i.rawId||"",displayName:i.displayName||null,email:i.email||null,phoneNumber:i.phoneNumber||null,photoURL:i.photoUrl||null}})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ki(n,e){const t=await Rn(n,{},async()=>{const i=ae({grant_type:"refresh_token",refresh_token:e}).slice(1),{tokenApiHost:r,apiKey:s}=n.config,o=Pn(n,r,"/v1/token",`key=${s}`),a=await n._getAdditionalHeaders();return a["Content-Type"]="application/x-www-form-urlencoded",kn.fetch()(o,{method:"POST",headers:a,body:i})});return{accessToken:t.access_token,expiresIn:t.expires_in,refreshToken:t.refresh_token}}async function Ji(n,e){return g(n,"POST","/v2/accounts:revokeToken",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class te{constructor(){this.refreshToken=null,this.accessToken=null,this.expirationTime=null}get isExpired(){return!this.expirationTime||Date.now()>this.expirationTime-3e4}updateFromServerResponse(e){d(e.idToken,"internal-error"),d(typeof e.idToken<"u","internal-error"),d(typeof e.refreshToken<"u","internal-error");const t="expiresIn"in e&&typeof e.expiresIn<"u"?Number(e.expiresIn):en(e.idToken);this.updateTokensAndExpiration(e.idToken,e.refreshToken,t)}updateFromIdToken(e){d(e.length!==0,"internal-error");const t=en(e);this.updateTokensAndExpiration(e,null,t)}async getToken(e,t=!1){return!t&&this.accessToken&&!this.isExpired?this.accessToken:(d(this.refreshToken,e,"user-token-expired"),this.refreshToken?(await this.refresh(e,this.refreshToken),this.accessToken):null)}clearRefreshToken(){this.refreshToken=null}async refresh(e,t){const{accessToken:i,refreshToken:r,expiresIn:s}=await Ki(e,t);this.updateTokensAndExpiration(i,r,Number(s))}updateTokensAndExpiration(e,t,i){this.refreshToken=t||null,this.accessToken=e||null,this.expirationTime=Date.now()+i*1e3}static fromJSON(e,t){const{refreshToken:i,accessToken:r,expirationTime:s}=t,o=new te;return i&&(d(typeof i=="string","internal-error",{appName:e}),o.refreshToken=i),r&&(d(typeof r=="string","internal-error",{appName:e}),o.accessToken=r),s&&(d(typeof s=="number","internal-error",{appName:e}),o.expirationTime=s),o}toJSON(){return{refreshToken:this.refreshToken,accessToken:this.accessToken,expirationTime:this.expirationTime}}_assign(e){this.accessToken=e.accessToken,this.refreshToken=e.refreshToken,this.expirationTime=e.expirationTime}_clone(){return Object.assign(new te,this.toJSON())}_performRefresh(){return L("not implemented")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function q(n,e){d(typeof n=="string"||typeof n>"u","internal-error",{appName:e})}class U{constructor(e){var{uid:t,auth:i,stsTokenManager:r}=e,s=Tt(e,["uid","auth","stsTokenManager"]);this.providerId="firebase",this.proactiveRefresh=new Gi(this),this.reloadUserInfo=null,this.reloadListener=null,this.uid=t,this.auth=i,this.stsTokenManager=r,this.accessToken=r.accessToken,this.displayName=s.displayName||null,this.email=s.email||null,this.emailVerified=s.emailVerified||!1,this.phoneNumber=s.phoneNumber||null,this.photoURL=s.photoURL||null,this.isAnonymous=s.isAnonymous||!1,this.tenantId=s.tenantId||null,this.providerData=s.providerData?[...s.providerData]:[],this.metadata=new ut(s.createdAt||void 0,s.lastLoginAt||void 0)}async getIdToken(e){const t=await W(this,this.stsTokenManager.getToken(this.auth,e));return d(t,this.auth,"internal-error"),this.accessToken!==t&&(this.accessToken=t,await this.auth._persistUserIfCurrent(this),this.auth._notifyListenersIfCurrent(this)),t}getIdTokenResult(e){return ji(this,e)}reload(){return Bi(this)}_assign(e){this!==e&&(d(this.uid===e.uid,this.auth,"internal-error"),this.displayName=e.displayName,this.photoURL=e.photoURL,this.email=e.email,this.emailVerified=e.emailVerified,this.phoneNumber=e.phoneNumber,this.isAnonymous=e.isAnonymous,this.tenantId=e.tenantId,this.providerData=e.providerData.map(t=>Object.assign({},t)),this.metadata._copy(e.metadata),this.stsTokenManager._assign(e.stsTokenManager))}_clone(e){const t=new U(Object.assign(Object.assign({},this),{auth:e,stsTokenManager:this.stsTokenManager._clone()}));return t.metadata._copy(this.metadata),t}_onReload(e){d(!this.reloadListener,this.auth,"internal-error"),this.reloadListener=e,this.reloadUserInfo&&(this._notifyReloadListener(this.reloadUserInfo),this.reloadUserInfo=null)}_notifyReloadListener(e){this.reloadListener?this.reloadListener(e):this.reloadUserInfo=e}_startProactiveRefresh(){this.proactiveRefresh._start()}_stopProactiveRefresh(){this.proactiveRefresh._stop()}async _updateTokensIfNecessary(e,t=!1){let i=!1;e.idToken&&e.idToken!==this.stsTokenManager.accessToken&&(this.stsTokenManager.updateFromServerResponse(e),i=!0),t&&await ye(this),await this.auth._persistUserIfCurrent(this),i&&this.auth._notifyListenersIfCurrent(this)}async delete(){if(_(this.auth.app))return Promise.reject(y(this.auth));const e=await this.getIdToken();return await W(this,Hi(this.auth,{idToken:e})),this.stsTokenManager.clearRefreshToken(),this.auth.signOut()}toJSON(){return Object.assign(Object.assign({uid:this.uid,email:this.email||void 0,emailVerified:this.emailVerified,displayName:this.displayName||void 0,isAnonymous:this.isAnonymous,photoURL:this.photoURL||void 0,phoneNumber:this.phoneNumber||void 0,tenantId:this.tenantId||void 0,providerData:this.providerData.map(e=>Object.assign({},e)),stsTokenManager:this.stsTokenManager.toJSON(),_redirectEventId:this._redirectEventId},this.metadata.toJSON()),{apiKey:this.auth.config.apiKey,appName:this.auth.name})}get refreshToken(){return this.stsTokenManager.refreshToken||""}static _fromJSON(e,t){var i,r,s,o,a,c,l,u;const h=(i=t.displayName)!==null&&i!==void 0?i:void 0,E=(r=t.email)!==null&&r!==void 0?r:void 0,Oe=(s=t.phoneNumber)!==null&&s!==void 0?s:void 0,Le=(o=t.photoURL)!==null&&o!==void 0?o:void 0,jt=(a=t.tenantId)!==null&&a!==void 0?a:void 0,et=(c=t._redirectEventId)!==null&&c!==void 0?c:void 0,zt=(l=t.createdAt)!==null&&l!==void 0?l:void 0,Gt=(u=t.lastLoginAt)!==null&&u!==void 0?u:void 0,{uid:tt,emailVerified:Bt,isAnonymous:$t,providerData:nt,stsTokenManager:Kt}=t;d(tt&&Kt,e,"internal-error");const Ii=te.fromJSON(this.name,Kt);d(typeof tt=="string",e,"internal-error"),q(h,e.name),q(E,e.name),d(typeof Bt=="boolean",e,"internal-error"),d(typeof $t=="boolean",e,"internal-error"),q(Oe,e.name),q(Le,e.name),q(jt,e.name),q(et,e.name),q(zt,e.name),q(Gt,e.name);const it=new U({uid:tt,auth:e,email:E,emailVerified:Bt,displayName:h,isAnonymous:$t,photoURL:Le,phoneNumber:Oe,tenantId:jt,stsTokenManager:Ii,createdAt:zt,lastLoginAt:Gt});return nt&&Array.isArray(nt)&&(it.providerData=nt.map(yi=>Object.assign({},yi))),et&&(it._redirectEventId=et),it}static async _fromIdTokenResponse(e,t,i=!1){const r=new te;r.updateFromServerResponse(t);const s=new U({uid:t.localId,auth:e,stsTokenManager:r,isAnonymous:i});return await ye(s),s}static async _fromGetAccountInfoResponse(e,t,i){const r=t.users[0];d(r.localId!==void 0,"internal-error");const s=r.providerUserInfo!==void 0?An(r.providerUserInfo):[],o=!(r.email&&r.passwordHash)&&!(s!=null&&s.length),a=new te;a.updateFromIdToken(i);const c=new U({uid:r.localId,auth:e,stsTokenManager:a,isAnonymous:o}),l={uid:r.localId,displayName:r.displayName||null,photoURL:r.photoUrl||null,email:r.email||null,emailVerified:r.emailVerified||!1,phoneNumber:r.phoneNumber||null,tenantId:r.tenantId||null,providerData:s,metadata:new ut(r.createdAt,r.lastLoginAt),isAnonymous:!(r.email&&r.passwordHash)&&!(s!=null&&s.length)};return Object.assign(c,l),c}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const tn=new Map;function P(n){A(n instanceof Function,"Expected a class definition");let e=tn.get(n);return e?(A(e instanceof n,"Instance stored in cache mismatched with class"),e):(e=new n,tn.set(n,e),e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Sn{constructor(){this.type="NONE",this.storage={}}async _isAvailable(){return!0}async _set(e,t){this.storage[e]=t}async _get(e){const t=this.storage[e];return t===void 0?null:t}async _remove(e){delete this.storage[e]}_addListener(e,t){}_removeListener(e,t){}}Sn.type="NONE";const se=Sn;/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function $(n,e,t){return`firebase:${n}:${e}:${t}`}class ne{constructor(e,t,i){this.persistence=e,this.auth=t,this.userKey=i;const{config:r,name:s}=this.auth;this.fullUserKey=$(this.userKey,r.apiKey,s),this.fullPersistenceKey=$("persistence",r.apiKey,s),this.boundEventHandler=t._onStorageEvent.bind(t),this.persistence._addListener(this.fullUserKey,this.boundEventHandler)}setCurrentUser(e){return this.persistence._set(this.fullUserKey,e.toJSON())}async getCurrentUser(){const e=await this.persistence._get(this.fullUserKey);return e?U._fromJSON(this.auth,e):null}removeCurrentUser(){return this.persistence._remove(this.fullUserKey)}savePersistenceForRedirect(){return this.persistence._set(this.fullPersistenceKey,this.persistence.type)}async setPersistence(e){if(this.persistence===e)return;const t=await this.getCurrentUser();if(await this.removeCurrentUser(),this.persistence=e,t)return this.setCurrentUser(t)}delete(){this.persistence._removeListener(this.fullUserKey,this.boundEventHandler)}static async create(e,t,i="authUser"){if(!t.length)return new ne(P(se),e,i);const r=(await Promise.all(t.map(async l=>{if(await l._isAvailable())return l}))).filter(l=>l);let s=r[0]||P(se);const o=$(i,e.config.apiKey,e.name);let a=null;for(const l of t)try{const u=await l._get(o);if(u){const h=U._fromJSON(e,u);l!==s&&(a=h),s=l;break}}catch{}const c=r.filter(l=>l._shouldAllowMigration);return!s._shouldAllowMigration||!c.length?new ne(s,e,i):(s=c[0],a&&await s._set(o,a.toJSON()),await Promise.all(t.map(async l=>{if(l!==s)try{await l._remove(o)}catch{}})),new ne(s,e,i))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function nn(n){const e=n.toLowerCase();if(e.includes("opera/")||e.includes("opr/")||e.includes("opios/"))return"Opera";if(Ln(e))return"IEMobile";if(e.includes("msie")||e.includes("trident/"))return"IE";if(e.includes("edge/"))return"Edge";if(Cn(e))return"Firefox";if(e.includes("silk/"))return"Silk";if(Dn(e))return"Blackberry";if(Un(e))return"Webos";if(Nn(e))return"Safari";if((e.includes("chrome/")||On(e))&&!e.includes("edge/"))return"Chrome";if(Pe(e))return"Android";{const t=/([a-zA-Z\d\.]+)\/[a-zA-Z\d\.]*$/,i=n.match(t);if((i==null?void 0:i.length)===2)return i[1]}return"Other"}function Cn(n=w()){return/firefox\//i.test(n)}function Nn(n=w()){const e=n.toLowerCase();return e.includes("safari/")&&!e.includes("chrome/")&&!e.includes("crios/")&&!e.includes("android")}function On(n=w()){return/crios\//i.test(n)}function Ln(n=w()){return/iemobile/i.test(n)}function Pe(n=w()){return/android/i.test(n)}function Dn(n=w()){return/blackberry/i.test(n)}function Un(n=w()){return/webos/i.test(n)}function be(n=w()){return/iphone|ipad|ipod/i.test(n)||/macintosh/i.test(n)&&/mobile/i.test(n)}function Yi(n=w()){return/(iPad|iPhone|iPod).*OS 7_\d/i.test(n)||/(iPad|iPhone|iPod).*OS 8_\d/i.test(n)}function Xi(n=w()){var e;return be(n)&&!!(!((e=window.navigator)===null||e===void 0)&&e.standalone)}function Qi(){return yn()&&document.documentMode===10}function Mn(n=w()){return be(n)||Pe(n)||Un(n)||Dn(n)||/windows phone/i.test(n)||Ln(n)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Fn(n,e=[]){let t;switch(n){case"Browser":t=nn(w());break;case"Worker":t=`${nn(w())}-${n}`;break;default:t=n}const i=e.length?e.join(","):"FirebaseCore-web";return`${t}/JsCore/${ke}/${i}`}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Zi{constructor(e){this.auth=e,this.queue=[]}pushCallback(e,t){const i=s=>new Promise((o,a)=>{try{const c=e(s);o(c)}catch(c){a(c)}});i.onAbort=t,this.queue.push(i);const r=this.queue.length-1;return()=>{this.queue[r]=()=>Promise.resolve()}}async runMiddleware(e){if(this.auth.currentUser===e)return;const t=[];try{for(const i of this.queue)await i(e),i.onAbort&&t.push(i.onAbort)}catch(i){t.reverse();for(const r of t)try{r()}catch{}throw this.auth._errorFactory.create("login-blocked",{originalMessage:i==null?void 0:i.message})}}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function er(n,e={}){return g(n,"GET","/v2/passwordPolicy",m(n,e))}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const tr=6;class nr{constructor(e){var t,i,r,s;const o=e.customStrengthOptions;this.customStrengthOptions={},this.customStrengthOptions.minPasswordLength=(t=o.minPasswordLength)!==null&&t!==void 0?t:tr,o.maxPasswordLength&&(this.customStrengthOptions.maxPasswordLength=o.maxPasswordLength),o.containsLowercaseCharacter!==void 0&&(this.customStrengthOptions.containsLowercaseLetter=o.containsLowercaseCharacter),o.containsUppercaseCharacter!==void 0&&(this.customStrengthOptions.containsUppercaseLetter=o.containsUppercaseCharacter),o.containsNumericCharacter!==void 0&&(this.customStrengthOptions.containsNumericCharacter=o.containsNumericCharacter),o.containsNonAlphanumericCharacter!==void 0&&(this.customStrengthOptions.containsNonAlphanumericCharacter=o.containsNonAlphanumericCharacter),this.enforcementState=e.enforcementState,this.enforcementState==="ENFORCEMENT_STATE_UNSPECIFIED"&&(this.enforcementState="OFF"),this.allowedNonAlphanumericCharacters=(r=(i=e.allowedNonAlphanumericCharacters)===null||i===void 0?void 0:i.join(""))!==null&&r!==void 0?r:"",this.forceUpgradeOnSignin=(s=e.forceUpgradeOnSignin)!==null&&s!==void 0?s:!1,this.schemaVersion=e.schemaVersion}validatePassword(e){var t,i,r,s,o,a;const c={isValid:!0,passwordPolicy:this};return this.validatePasswordLengthOptions(e,c),this.validatePasswordCharacterOptions(e,c),c.isValid&&(c.isValid=(t=c.meetsMinPasswordLength)!==null&&t!==void 0?t:!0),c.isValid&&(c.isValid=(i=c.meetsMaxPasswordLength)!==null&&i!==void 0?i:!0),c.isValid&&(c.isValid=(r=c.containsLowercaseLetter)!==null&&r!==void 0?r:!0),c.isValid&&(c.isValid=(s=c.containsUppercaseLetter)!==null&&s!==void 0?s:!0),c.isValid&&(c.isValid=(o=c.containsNumericCharacter)!==null&&o!==void 0?o:!0),c.isValid&&(c.isValid=(a=c.containsNonAlphanumericCharacter)!==null&&a!==void 0?a:!0),c}validatePasswordLengthOptions(e,t){const i=this.customStrengthOptions.minPasswordLength,r=this.customStrengthOptions.maxPasswordLength;i&&(t.meetsMinPasswordLength=e.length>=i),r&&(t.meetsMaxPasswordLength=e.length<=r)}validatePasswordCharacterOptions(e,t){this.updatePasswordCharacterOptionsStatuses(t,!1,!1,!1,!1);let i;for(let r=0;r<e.length;r++)i=e.charAt(r),this.updatePasswordCharacterOptionsStatuses(t,i>="a"&&i<="z",i>="A"&&i<="Z",i>="0"&&i<="9",this.allowedNonAlphanumericCharacters.includes(i))}updatePasswordCharacterOptionsStatuses(e,t,i,r,s){this.customStrengthOptions.containsLowercaseLetter&&(e.containsLowercaseLetter||(e.containsLowercaseLetter=t)),this.customStrengthOptions.containsUppercaseLetter&&(e.containsUppercaseLetter||(e.containsUppercaseLetter=i)),this.customStrengthOptions.containsNumericCharacter&&(e.containsNumericCharacter||(e.containsNumericCharacter=r)),this.customStrengthOptions.containsNonAlphanumericCharacter&&(e.containsNonAlphanumericCharacter||(e.containsNonAlphanumericCharacter=s))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ir{constructor(e,t,i,r){this.app=e,this.heartbeatServiceProvider=t,this.appCheckServiceProvider=i,this.config=r,this.currentUser=null,this.emulatorConfig=null,this.operations=Promise.resolve(),this.authStateSubscription=new rn(this),this.idTokenSubscription=new rn(this),this.beforeStateQueue=new Zi(this),this.redirectUser=null,this.isProactiveRefreshEnabled=!1,this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION=1,this._canInitEmulator=!0,this._isInitialized=!1,this._deleted=!1,this._initializationPromise=null,this._popupRedirectResolver=null,this._errorFactory=En,this._agentRecaptchaConfig=null,this._tenantRecaptchaConfigs={},this._projectPasswordPolicy=null,this._tenantPasswordPolicies={},this.lastNotifiedUid=void 0,this.languageCode=null,this.tenantId=null,this.settings={appVerificationDisabledForTesting:!1},this.frameworks=[],this.name=e.name,this.clientVersion=r.sdkClientVersion}_initializeWithPersistence(e,t){return t&&(this._popupRedirectResolver=P(t)),this._initializationPromise=this.queue(async()=>{var i,r;if(!this._deleted&&(this.persistenceManager=await ne.create(this,e),!this._deleted)){if(!((i=this._popupRedirectResolver)===null||i===void 0)&&i._shouldInitProactively)try{await this._popupRedirectResolver._initialize(this)}catch{}await this.initializeCurrentUser(t),this.lastNotifiedUid=((r=this.currentUser)===null||r===void 0?void 0:r.uid)||null,!this._deleted&&(this._isInitialized=!0)}}),this._initializationPromise}async _onStorageEvent(){if(this._deleted)return;const e=await this.assertedPersistence.getCurrentUser();if(!(!this.currentUser&&!e)){if(this.currentUser&&e&&this.currentUser.uid===e.uid){this._currentUser._assign(e),await this.currentUser.getIdToken();return}await this._updateCurrentUser(e,!0)}}async initializeCurrentUserFromIdToken(e){try{const t=await bn(this,{idToken:e}),i=await U._fromGetAccountInfoResponse(this,t,e);await this.directlySetCurrentUser(i)}catch(t){console.warn("FirebaseServerApp could not login user with provided authIdToken: ",t),await this.directlySetCurrentUser(null)}}async initializeCurrentUser(e){var t;if(_(this.app)){const o=this.app.settings.authIdToken;return o?new Promise(a=>{setTimeout(()=>this.initializeCurrentUserFromIdToken(o).then(a,a))}):this.directlySetCurrentUser(null)}const i=await this.assertedPersistence.getCurrentUser();let r=i,s=!1;if(e&&this.config.authDomain){await this.getOrInitRedirectPersistenceManager();const o=(t=this.redirectUser)===null||t===void 0?void 0:t._redirectEventId,a=r==null?void 0:r._redirectEventId,c=await this.tryRedirectSignIn(e);(!o||o===a)&&(c!=null&&c.user)&&(r=c.user,s=!0)}if(!r)return this.directlySetCurrentUser(null);if(!r._redirectEventId){if(s)try{await this.beforeStateQueue.runMiddleware(r)}catch(o){r=i,this._popupRedirectResolver._overrideRedirectResult(this,()=>Promise.reject(o))}return r?this.reloadAndSetCurrentUserOrClear(r):this.directlySetCurrentUser(null)}return d(this._popupRedirectResolver,this,"argument-error"),await this.getOrInitRedirectPersistenceManager(),this.redirectUser&&this.redirectUser._redirectEventId===r._redirectEventId?this.directlySetCurrentUser(r):this.reloadAndSetCurrentUserOrClear(r)}async tryRedirectSignIn(e){let t=null;try{t=await this._popupRedirectResolver._completeRedirectFn(this,e,!0)}catch{await this._setRedirectUser(null)}return t}async reloadAndSetCurrentUserOrClear(e){try{await ye(e)}catch(t){if((t==null?void 0:t.code)!=="auth/network-request-failed")return this.directlySetCurrentUser(null)}return this.directlySetCurrentUser(e)}useDeviceLanguage(){this.languageCode=Li()}async _delete(){this._deleted=!0}async updateCurrentUser(e){if(_(this.app))return Promise.reject(y(this));const t=e?p(e):null;return t&&d(t.auth.config.apiKey===this.config.apiKey,this,"invalid-user-token"),this._updateCurrentUser(t&&t._clone(this))}async _updateCurrentUser(e,t=!1){if(!this._deleted)return e&&d(this.tenantId===e.tenantId,this,"tenant-id-mismatch"),t||await this.beforeStateQueue.runMiddleware(e),this.queue(async()=>{await this.directlySetCurrentUser(e),this.notifyAuthListeners()})}async signOut(){return _(this.app)?Promise.reject(y(this)):(await this.beforeStateQueue.runMiddleware(null),(this.redirectPersistenceManager||this._popupRedirectResolver)&&await this._setRedirectUser(null),this._updateCurrentUser(null,!0))}setPersistence(e){return _(this.app)?Promise.reject(y(this)):this.queue(async()=>{await this.assertedPersistence.setPersistence(P(e))})}_getRecaptchaConfig(){return this.tenantId==null?this._agentRecaptchaConfig:this._tenantRecaptchaConfigs[this.tenantId]}async validatePassword(e){this._getPasswordPolicyInternal()||await this._updatePasswordPolicy();const t=this._getPasswordPolicyInternal();return t.schemaVersion!==this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION?Promise.reject(this._errorFactory.create("unsupported-password-policy-schema-version",{})):t.validatePassword(e)}_getPasswordPolicyInternal(){return this.tenantId===null?this._projectPasswordPolicy:this._tenantPasswordPolicies[this.tenantId]}async _updatePasswordPolicy(){const e=await er(this),t=new nr(e);this.tenantId===null?this._projectPasswordPolicy=t:this._tenantPasswordPolicies[this.tenantId]=t}_getPersistence(){return this.assertedPersistence.persistence.type}_updateErrorMap(e){this._errorFactory=new yt("auth","Firebase",e())}onAuthStateChanged(e,t,i){return this.registerStateListener(this.authStateSubscription,e,t,i)}beforeAuthStateChanged(e,t){return this.beforeStateQueue.pushCallback(e,t)}onIdTokenChanged(e,t,i){return this.registerStateListener(this.idTokenSubscription,e,t,i)}authStateReady(){return new Promise((e,t)=>{if(this.currentUser)e();else{const i=this.onAuthStateChanged(()=>{i(),e()},t)}})}async revokeAccessToken(e){if(this.currentUser){const t=await this.currentUser.getIdToken(),i={providerId:"apple.com",tokenType:"ACCESS_TOKEN",token:e,idToken:t};this.tenantId!=null&&(i.tenantId=this.tenantId),await Ji(this,i)}}toJSON(){var e;return{apiKey:this.config.apiKey,authDomain:this.config.authDomain,appName:this.name,currentUser:(e=this._currentUser)===null||e===void 0?void 0:e.toJSON()}}async _setRedirectUser(e,t){const i=await this.getOrInitRedirectPersistenceManager(t);return e===null?i.removeCurrentUser():i.setCurrentUser(e)}async getOrInitRedirectPersistenceManager(e){if(!this.redirectPersistenceManager){const t=e&&P(e)||this._popupRedirectResolver;d(t,this,"argument-error"),this.redirectPersistenceManager=await ne.create(this,[P(t._redirectPersistence)],"redirectUser"),this.redirectUser=await this.redirectPersistenceManager.getCurrentUser()}return this.redirectPersistenceManager}async _redirectUserForId(e){var t,i;return this._isInitialized&&await this.queue(async()=>{}),((t=this._currentUser)===null||t===void 0?void 0:t._redirectEventId)===e?this._currentUser:((i=this.redirectUser)===null||i===void 0?void 0:i._redirectEventId)===e?this.redirectUser:null}async _persistUserIfCurrent(e){if(e===this.currentUser)return this.queue(async()=>this.directlySetCurrentUser(e))}_notifyListenersIfCurrent(e){e===this.currentUser&&this.notifyAuthListeners()}_key(){return`${this.config.authDomain}:${this.config.apiKey}:${this.name}`}_startProactiveRefresh(){this.isProactiveRefreshEnabled=!0,this.currentUser&&this._currentUser._startProactiveRefresh()}_stopProactiveRefresh(){this.isProactiveRefreshEnabled=!1,this.currentUser&&this._currentUser._stopProactiveRefresh()}get _currentUser(){return this.currentUser}notifyAuthListeners(){var e,t;if(!this._isInitialized)return;this.idTokenSubscription.next(this.currentUser);const i=(t=(e=this.currentUser)===null||e===void 0?void 0:e.uid)!==null&&t!==void 0?t:null;this.lastNotifiedUid!==i&&(this.lastNotifiedUid=i,this.authStateSubscription.next(this.currentUser))}registerStateListener(e,t,i,r){if(this._deleted)return()=>{};const s=typeof t=="function"?t:t.next.bind(t);let o=!1;const a=this._isInitialized?Promise.resolve():this._initializationPromise;if(d(a,this,"internal-error"),a.then(()=>{o||s(this.currentUser)}),typeof t=="function"){const c=e.addObserver(t,i,r);return()=>{o=!0,c()}}else{const c=e.addObserver(t);return()=>{o=!0,c()}}}async directlySetCurrentUser(e){this.currentUser&&this.currentUser!==e&&this._currentUser._stopProactiveRefresh(),e&&this.isProactiveRefreshEnabled&&e._startProactiveRefresh(),this.currentUser=e,e?await this.assertedPersistence.setCurrentUser(e):await this.assertedPersistence.removeCurrentUser()}queue(e){return this.operations=this.operations.then(e,e),this.operations}get assertedPersistence(){return d(this.persistenceManager,this,"internal-error"),this.persistenceManager}_logFramework(e){!e||this.frameworks.includes(e)||(this.frameworks.push(e),this.frameworks.sort(),this.clientVersion=Fn(this.config.clientPlatform,this._getFrameworks()))}_getFrameworks(){return this.frameworks}async _getAdditionalHeaders(){var e;const t={"X-Client-Version":this.clientVersion};this.app.options.appId&&(t["X-Firebase-gmpid"]=this.app.options.appId);const i=await((e=this.heartbeatServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getHeartbeatsHeader());i&&(t["X-Firebase-Client"]=i);const r=await this._getAppCheckToken();return r&&(t["X-Firebase-AppCheck"]=r),t}async _getAppCheckToken(){var e;const t=await((e=this.appCheckServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getToken());return t!=null&&t.error&&Ni(`Error while retrieving App Check token: ${t.error}`),t==null?void 0:t.token}}function f(n){return p(n)}class rn{constructor(e){this.auth=e,this.observer=null,this.addObserver=ki(t=>this.observer=t)}get next(){return d(this.observer,this.auth,"internal-error"),this.observer.next.bind(this.observer)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Ae={async loadJS(){throw new Error("Unable to load external scripts")},recaptchaV2Script:"",recaptchaEnterpriseScript:"",gapiScript:""};function rr(n){Ae=n}function bt(n){return Ae.loadJS(n)}function sr(){return Ae.recaptchaV2Script}function or(){return Ae.recaptchaEnterpriseScript}function ar(){return Ae.gapiScript}function Vn(n){return`__${n}${Math.floor(Math.random()*1e6)}`}const cr="recaptcha-enterprise",dr="NO_RECAPTCHA";class lr{constructor(e){this.type=cr,this.auth=f(e)}async verify(e="verify",t=!1){async function i(s){if(!t){if(s.tenantId==null&&s._agentRecaptchaConfig!=null)return s._agentRecaptchaConfig.siteKey;if(s.tenantId!=null&&s._tenantRecaptchaConfigs[s.tenantId]!==void 0)return s._tenantRecaptchaConfigs[s.tenantId].siteKey}return new Promise(async(o,a)=>{xi(s,{clientType:"CLIENT_TYPE_WEB",version:"RECAPTCHA_ENTERPRISE"}).then(c=>{if(c.recaptchaKey===void 0)a(new Error("recaptcha Enterprise site key undefined"));else{const l=new Vi(c);return s.tenantId==null?s._agentRecaptchaConfig=l:s._tenantRecaptchaConfigs[s.tenantId]=l,o(l.siteKey)}}).catch(c=>{a(c)})})}function r(s,o,a){const c=window.grecaptcha;Zt(c)?c.enterprise.ready(()=>{c.enterprise.execute(s,{action:e}).then(l=>{o(l)}).catch(()=>{o(dr)})}):a(Error("No reCAPTCHA enterprise script loaded."))}return new Promise((s,o)=>{i(this.auth).then(a=>{if(!t&&Zt(window.grecaptcha))r(a,s,o);else{if(typeof window>"u"){o(new Error("RecaptchaVerifier is only supported in browser"));return}let c=or();c.length!==0&&(c+=a),bt(c).then(()=>{r(a,s,o)}).catch(l=>{o(l)})}}).catch(a=>{o(a)})})}}async function sn(n,e,t,i=!1){const r=new lr(n);let s;try{s=await r.verify(t)}catch{s=await r.verify(t,!0)}const o=Object.assign({},e);return i?Object.assign(o,{captchaResp:s}):Object.assign(o,{captchaResponse:s}),Object.assign(o,{clientType:"CLIENT_TYPE_WEB"}),Object.assign(o,{recaptchaVersion:"RECAPTCHA_ENTERPRISE"}),o}async function we(n,e,t,i){var r;if(!((r=n._getRecaptchaConfig())===null||r===void 0)&&r.isProviderEnabled("EMAIL_PASSWORD_PROVIDER")){const s=await sn(n,e,t,t==="getOobCode");return i(n,s)}else return i(n,e).catch(async s=>{if(s.code==="auth/missing-recaptcha-token"){console.log(`${t} is protected by reCAPTCHA Enterprise for this project. Automatically triggering the reCAPTCHA flow and restarting the flow.`);const o=await sn(n,e,t,t==="getOobCode");return i(n,o)}else return Promise.reject(s)})}function ur(n,e){const t=(e==null?void 0:e.persistence)||[],i=(Array.isArray(t)?t:[t]).map(P);e!=null&&e.errorMap&&n._updateErrorMap(e.errorMap),n._initializeWithPersistence(i,e==null?void 0:e.popupRedirectResolver)}function hr(n,e,t){const i=f(n);d(i._canInitEmulator,i,"emulator-config-failed"),d(/^https?:\/\//.test(e),i,"invalid-emulator-scheme");const r=!!(t!=null&&t.disableWarnings),s=Wn(e),{host:o,port:a}=pr(e),c=a===null?"":`:${a}`;i.config.emulator={url:`${s}//${o}${c}/`},i.settings.appVerificationDisabledForTesting=!0,i.emulatorConfig=Object.freeze({host:o,port:a,protocol:s.replace(":",""),options:Object.freeze({disableWarnings:r})}),r||fr()}function Wn(n){const e=n.indexOf(":");return e<0?"":n.substr(0,e+1)}function pr(n){const e=Wn(n),t=/(\/\/)?([^?#/]+)/.exec(n.substr(e.length));if(!t)return{host:"",port:null};const i=t[2].split("@").pop()||"",r=/^(\[[^\]]+\])(:|$)/.exec(i);if(r){const s=r[1];return{host:s,port:on(i.substr(s.length+1))}}else{const[s,o]=i.split(":");return{host:s,port:on(o)}}}function on(n){if(!n)return null;const e=Number(n);return isNaN(e)?null:e}function fr(){function n(){const e=document.createElement("p"),t=e.style;e.innerText="Running in emulator mode. Do not use with production credentials.",t.position="fixed",t.width="100%",t.backgroundColor="#ffffff",t.border=".1em solid #000000",t.color="#b50000",t.bottom="0px",t.left="0px",t.margin="0px",t.zIndex="10000",t.textAlign="center",e.classList.add("firebase-emulator-warning"),document.body.appendChild(e)}typeof console<"u"&&typeof console.info=="function"&&console.info("WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials."),typeof window<"u"&&typeof document<"u"&&(document.readyState==="loading"?window.addEventListener("DOMContentLoaded",n):n())}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class de{constructor(e,t){this.providerId=e,this.signInMethod=t}toJSON(){return L("not implemented")}_getIdTokenResponse(e){return L("not implemented")}_linkToIdToken(e,t){return L("not implemented")}_getReauthenticationResolver(e){return L("not implemented")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function xn(n,e){return g(n,"POST","/v1/accounts:resetPassword",m(n,e))}async function mr(n,e){return g(n,"POST","/v1/accounts:update",e)}async function gr(n,e){return g(n,"POST","/v1/accounts:signUp",e)}async function _r(n,e){return g(n,"POST","/v1/accounts:update",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function vr(n,e){return x(n,"POST","/v1/accounts:signInWithPassword",m(n,e))}async function Ge(n,e){return g(n,"POST","/v1/accounts:sendOobCode",m(n,e))}async function Ir(n,e){return Ge(n,e)}async function yr(n,e){return Ge(n,e)}async function wr(n,e){return Ge(n,e)}async function Tr(n,e){return Ge(n,e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Er(n,e){return x(n,"POST","/v1/accounts:signInWithEmailLink",m(n,e))}async function kr(n,e){return x(n,"POST","/v1/accounts:signInWithEmailLink",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Te extends de{constructor(e,t,i,r=null){super("password",i),this._email=e,this._password=t,this._tenantId=r}static _fromEmailAndPassword(e,t){return new Te(e,t,"password")}static _fromEmailAndCode(e,t,i=null){return new Te(e,t,"emailLink",i)}toJSON(){return{email:this._email,password:this._password,signInMethod:this.signInMethod,tenantId:this._tenantId}}static fromJSON(e){const t=typeof e=="string"?JSON.parse(e):e;if(t!=null&&t.email&&(t!=null&&t.password)){if(t.signInMethod==="password")return this._fromEmailAndPassword(t.email,t.password);if(t.signInMethod==="emailLink")return this._fromEmailAndCode(t.email,t.password,t.tenantId)}return null}async _getIdTokenResponse(e){switch(this.signInMethod){case"password":const t={returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return we(e,t,"signInWithPassword",vr);case"emailLink":return Er(e,{email:this._email,oobCode:this._password});default:T(e,"internal-error")}}async _linkToIdToken(e,t){switch(this.signInMethod){case"password":const i={idToken:t,returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return we(e,i,"signUpPassword",gr);case"emailLink":return kr(e,{idToken:t,email:this._email,oobCode:this._password});default:T(e,"internal-error")}}_getReauthenticationResolver(e){return this._getIdTokenResponse(e)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function V(n,e){return x(n,"POST","/v1/accounts:signInWithIdp",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Rr="http://localhost";class D extends de{constructor(){super(...arguments),this.pendingToken=null}static _fromParams(e){const t=new D(e.providerId,e.signInMethod);return e.idToken||e.accessToken?(e.idToken&&(t.idToken=e.idToken),e.accessToken&&(t.accessToken=e.accessToken),e.nonce&&!e.pendingToken&&(t.nonce=e.nonce),e.pendingToken&&(t.pendingToken=e.pendingToken)):e.oauthToken&&e.oauthTokenSecret?(t.accessToken=e.oauthToken,t.secret=e.oauthTokenSecret):T("argument-error"),t}toJSON(){return{idToken:this.idToken,accessToken:this.accessToken,secret:this.secret,nonce:this.nonce,pendingToken:this.pendingToken,providerId:this.providerId,signInMethod:this.signInMethod}}static fromJSON(e){const t=typeof e=="string"?JSON.parse(e):e,{providerId:i,signInMethod:r}=t,s=Tt(t,["providerId","signInMethod"]);if(!i||!r)return null;const o=new D(i,r);return o.idToken=s.idToken||void 0,o.accessToken=s.accessToken||void 0,o.secret=s.secret,o.nonce=s.nonce,o.pendingToken=s.pendingToken||null,o}_getIdTokenResponse(e){const t=this.buildRequest();return V(e,t)}_linkToIdToken(e,t){const i=this.buildRequest();return i.idToken=t,V(e,i)}_getReauthenticationResolver(e){const t=this.buildRequest();return t.autoCreate=!1,V(e,t)}buildRequest(){const e={requestUri:Rr,returnSecureToken:!0};if(this.pendingToken)e.pendingToken=this.pendingToken;else{const t={};this.idToken&&(t.id_token=this.idToken),this.accessToken&&(t.access_token=this.accessToken),this.secret&&(t.oauth_token_secret=this.secret),t.providerId=this.providerId,this.nonce&&!this.pendingToken&&(t.nonce=this.nonce),e.postBody=ae(t)}return e}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Pr(n,e){return g(n,"POST","/v1/accounts:sendVerificationCode",m(n,e))}async function br(n,e){return x(n,"POST","/v1/accounts:signInWithPhoneNumber",m(n,e))}async function Ar(n,e){const t=await x(n,"POST","/v1/accounts:signInWithPhoneNumber",m(n,e));if(t.temporaryProof)throw me(n,"account-exists-with-different-credential",t);return t}const Sr={USER_NOT_FOUND:"user-not-found"};async function Cr(n,e){const t=Object.assign(Object.assign({},e),{operation:"REAUTH"});return x(n,"POST","/v1/accounts:signInWithPhoneNumber",m(n,t),Sr)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class K extends de{constructor(e){super("phone","phone"),this.params=e}static _fromVerification(e,t){return new K({verificationId:e,verificationCode:t})}static _fromTokenResponse(e,t){return new K({phoneNumber:e,temporaryProof:t})}_getIdTokenResponse(e){return br(e,this._makeVerificationRequest())}_linkToIdToken(e,t){return Ar(e,Object.assign({idToken:t},this._makeVerificationRequest()))}_getReauthenticationResolver(e){return Cr(e,this._makeVerificationRequest())}_makeVerificationRequest(){const{temporaryProof:e,phoneNumber:t,verificationId:i,verificationCode:r}=this.params;return e&&t?{temporaryProof:e,phoneNumber:t}:{sessionInfo:i,code:r}}toJSON(){const e={providerId:this.providerId};return this.params.phoneNumber&&(e.phoneNumber=this.params.phoneNumber),this.params.temporaryProof&&(e.temporaryProof=this.params.temporaryProof),this.params.verificationCode&&(e.verificationCode=this.params.verificationCode),this.params.verificationId&&(e.verificationId=this.params.verificationId),e}static fromJSON(e){typeof e=="string"&&(e=JSON.parse(e));const{verificationId:t,verificationCode:i,phoneNumber:r,temporaryProof:s}=e;return!i&&!t&&!r&&!s?null:new K({verificationId:t,verificationCode:i,phoneNumber:r,temporaryProof:s})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Nr(n){switch(n){case"recoverEmail":return"RECOVER_EMAIL";case"resetPassword":return"PASSWORD_RESET";case"signIn":return"EMAIL_SIGNIN";case"verifyEmail":return"VERIFY_EMAIL";case"verifyAndChangeEmail":return"VERIFY_AND_CHANGE_EMAIL";case"revertSecondFactorAddition":return"REVERT_SECOND_FACTOR_ADDITION";default:return null}}function Or(n){const e=ee(fe(n)).link,t=e?ee(fe(e)).deep_link_id:null,i=ee(fe(n)).deep_link_id;return(i?ee(fe(i)).link:null)||i||t||e||n}class Be{constructor(e){var t,i,r,s,o,a;const c=ee(fe(e)),l=(t=c.apiKey)!==null&&t!==void 0?t:null,u=(i=c.oobCode)!==null&&i!==void 0?i:null,h=Nr((r=c.mode)!==null&&r!==void 0?r:null);d(l&&u&&h,"argument-error"),this.apiKey=l,this.operation=h,this.code=u,this.continueUrl=(s=c.continueUrl)!==null&&s!==void 0?s:null,this.languageCode=(o=c.languageCode)!==null&&o!==void 0?o:null,this.tenantId=(a=c.tenantId)!==null&&a!==void 0?a:null}static parseLink(e){const t=Or(e);try{return new Be(t)}catch{return null}}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class G{constructor(){this.providerId=G.PROVIDER_ID}static credential(e,t){return Te._fromEmailAndPassword(e,t)}static credentialWithLink(e,t){const i=Be.parseLink(t);return d(i,"argument-error"),Te._fromEmailAndCode(e,i.code,i.tenantId)}}G.PROVIDER_ID="password";G.EMAIL_PASSWORD_SIGN_IN_METHOD="password";G.EMAIL_LINK_SIGN_IN_METHOD="emailLink";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class H{constructor(e){this.providerId=e,this.defaultLanguageCode=null,this.customParameters={}}setDefaultLanguage(e){this.defaultLanguageCode=e}setCustomParameters(e){return this.customParameters=e,this}getCustomParameters(){return this.customParameters}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class le extends H{constructor(){super(...arguments),this.scopes=[]}addScope(e){return this.scopes.includes(e)||this.scopes.push(e),this}getScopes(){return[...this.scopes]}}class ie extends le{static credentialFromJSON(e){const t=typeof e=="string"?JSON.parse(e):e;return d("providerId"in t&&"signInMethod"in t,"argument-error"),D._fromParams(t)}credential(e){return this._credential(Object.assign(Object.assign({},e),{nonce:e.rawNonce}))}_credential(e){return d(e.idToken||e.accessToken,"argument-error"),D._fromParams(Object.assign(Object.assign({},e),{providerId:this.providerId,signInMethod:this.providerId}))}static credentialFromResult(e){return ie.oauthCredentialFromTaggedObject(e)}static credentialFromError(e){return ie.oauthCredentialFromTaggedObject(e.customData||{})}static oauthCredentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthIdToken:t,oauthAccessToken:i,oauthTokenSecret:r,pendingToken:s,nonce:o,providerId:a}=e;if(!i&&!r&&!t&&!s||!a)return null;try{return new ie(a)._credential({idToken:t,accessToken:i,nonce:o,pendingToken:s})}catch{return null}}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class S extends le{constructor(){super("facebook.com")}static credential(e){return D._fromParams({providerId:S.PROVIDER_ID,signInMethod:S.FACEBOOK_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return S.credentialFromTaggedObject(e)}static credentialFromError(e){return S.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return S.credential(e.oauthAccessToken)}catch{return null}}}S.FACEBOOK_SIGN_IN_METHOD="facebook.com";S.PROVIDER_ID="facebook.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class C extends le{constructor(){super("google.com"),this.addScope("profile")}static credential(e,t){return D._fromParams({providerId:C.PROVIDER_ID,signInMethod:C.GOOGLE_SIGN_IN_METHOD,idToken:e,accessToken:t})}static credentialFromResult(e){return C.credentialFromTaggedObject(e)}static credentialFromError(e){return C.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthIdToken:t,oauthAccessToken:i}=e;if(!t&&!i)return null;try{return C.credential(t,i)}catch{return null}}}C.GOOGLE_SIGN_IN_METHOD="google.com";C.PROVIDER_ID="google.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class N extends le{constructor(){super("github.com")}static credential(e){return D._fromParams({providerId:N.PROVIDER_ID,signInMethod:N.GITHUB_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return N.credentialFromTaggedObject(e)}static credentialFromError(e){return N.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return N.credential(e.oauthAccessToken)}catch{return null}}}N.GITHUB_SIGN_IN_METHOD="github.com";N.PROVIDER_ID="github.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Lr="http://localhost";class oe extends de{constructor(e,t){super(e,e),this.pendingToken=t}_getIdTokenResponse(e){const t=this.buildRequest();return V(e,t)}_linkToIdToken(e,t){const i=this.buildRequest();return i.idToken=t,V(e,i)}_getReauthenticationResolver(e){const t=this.buildRequest();return t.autoCreate=!1,V(e,t)}toJSON(){return{signInMethod:this.signInMethod,providerId:this.providerId,pendingToken:this.pendingToken}}static fromJSON(e){const t=typeof e=="string"?JSON.parse(e):e,{providerId:i,signInMethod:r,pendingToken:s}=t;return!i||!r||!s||i!==r?null:new oe(i,s)}static _create(e,t){return new oe(e,t)}buildRequest(){return{requestUri:Lr,returnSecureToken:!0,pendingToken:this.pendingToken}}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Dr="saml.";class xe extends H{constructor(e){d(e.startsWith(Dr),"argument-error"),super(e)}static credentialFromResult(e){return xe.samlCredentialFromTaggedObject(e)}static credentialFromError(e){return xe.samlCredentialFromTaggedObject(e.customData||{})}static credentialFromJSON(e){const t=oe.fromJSON(e);return d(t,"argument-error"),t}static samlCredentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{pendingToken:t,providerId:i}=e;if(!t||!i)return null;try{return oe._create(i,t)}catch{return null}}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class O extends le{constructor(){super("twitter.com")}static credential(e,t){return D._fromParams({providerId:O.PROVIDER_ID,signInMethod:O.TWITTER_SIGN_IN_METHOD,oauthToken:e,oauthTokenSecret:t})}static credentialFromResult(e){return O.credentialFromTaggedObject(e)}static credentialFromError(e){return O.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthAccessToken:t,oauthTokenSecret:i}=e;if(!t||!i)return null;try{return O.credential(t,i)}catch{return null}}}O.TWITTER_SIGN_IN_METHOD="twitter.com";O.PROVIDER_ID="twitter.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Hn(n,e){return x(n,"POST","/v1/accounts:signUp",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class b{constructor(e){this.user=e.user,this.providerId=e.providerId,this._tokenResponse=e._tokenResponse,this.operationType=e.operationType}static async _fromIdTokenResponse(e,t,i,r=!1){const s=await U._fromIdTokenResponse(e,i,r),o=an(i);return new b({user:s,providerId:o,_tokenResponse:i,operationType:t})}static async _forOperation(e,t,i){await e._updateTokensIfNecessary(i,!0);const r=an(i);return new b({user:e,providerId:r,_tokenResponse:i,operationType:t})}}function an(n){return n.providerId?n.providerId:"phoneNumber"in n?"phone":null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ur(n){var e;if(_(n.app))return Promise.reject(y(n));const t=f(n);if(await t._initializationPromise,!((e=t.currentUser)===null||e===void 0)&&e.isAnonymous)return new b({user:t.currentUser,providerId:null,operationType:"signIn"});const i=await Hn(t,{returnSecureToken:!0}),r=await b._fromIdTokenResponse(t,"signIn",i,!0);return await t._updateCurrentUser(r.user),r}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class He extends z{constructor(e,t,i,r){var s;super(t.code,t.message),this.operationType=i,this.user=r,Object.setPrototypeOf(this,He.prototype),this.customData={appName:e.name,tenantId:(s=e.tenantId)!==null&&s!==void 0?s:void 0,_serverResponse:t.customData._serverResponse,operationType:i}}static _fromErrorAndOperation(e,t,i,r){return new He(e,t,i,r)}}function qn(n,e,t,i){return(e==="reauthenticate"?t._getReauthenticationResolver(n):t._getIdTokenResponse(n)).catch(s=>{throw s.code==="auth/multi-factor-auth-required"?He._fromErrorAndOperation(n,s,e,i):s})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function jn(n){return new Set(n.map(({providerId:e})=>e).filter(e=>!!e))}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Mr(n,e){const t=p(n);await $e(!0,t,e);const{providerUserInfo:i}=await qi(t.auth,{idToken:await t.getIdToken(),deleteProvider:[e]}),r=jn(i||[]);return t.providerData=t.providerData.filter(s=>r.has(s.providerId)),r.has("phone")||(t.phoneNumber=null),await t.auth._persistUserIfCurrent(t),t}async function At(n,e,t=!1){const i=await W(n,e._linkToIdToken(n.auth,await n.getIdToken()),t);return b._forOperation(n,"link",i)}async function $e(n,e,t){await ye(e);const i=jn(e.providerData),r=n===!1?"provider-already-linked":"no-such-provider";d(i.has(t)===n,e.auth,r)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function zn(n,e,t=!1){const{auth:i}=n;if(_(i.app))return Promise.reject(y(i));const r="reauthenticate";try{const s=await W(n,qn(i,r,e,n),t);d(s.idToken,i,"internal-error");const o=ze(s.idToken);d(o,i,"internal-error");const{sub:a}=o;return d(n.uid===a,i,"user-mismatch"),b._forOperation(n,r,s)}catch(s){throw(s==null?void 0:s.code)==="auth/user-not-found"&&T(i,"user-mismatch"),s}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Gn(n,e,t=!1){if(_(n.app))return Promise.reject(y(n));const i="signIn",r=await qn(n,i,e),s=await b._fromIdTokenResponse(n,i,r);return t||await n._updateCurrentUser(s.user),s}async function Ke(n,e){return Gn(f(n),e)}async function Bn(n,e){const t=p(n);return await $e(!1,t,e.providerId),At(t,e)}async function $n(n,e){return zn(p(n),e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Fr(n,e){return x(n,"POST","/v1/accounts:signInWithCustomToken",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Vr(n,e){if(_(n.app))return Promise.reject(y(n));const t=f(n),i=await Fr(t,{token:e,returnSecureToken:!0}),r=await b._fromIdTokenResponse(t,"signIn",i);return await t._updateCurrentUser(r.user),r}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Se{constructor(e,t){this.factorId=e,this.uid=t.mfaEnrollmentId,this.enrollmentTime=new Date(t.enrolledAt).toUTCString(),this.displayName=t.displayName}static _fromServerResponse(e,t){return"phoneInfo"in t?St._fromServerResponse(e,t):"totpInfo"in t?Ct._fromServerResponse(e,t):T(e,"internal-error")}}class St extends Se{constructor(e){super("phone",e),this.phoneNumber=e.phoneInfo}static _fromServerResponse(e,t){return new St(t)}}class Ct extends Se{constructor(e){super("totp",e)}static _fromServerResponse(e,t){return new Ct(t)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Je(n,e,t){var i;d(((i=t.url)===null||i===void 0?void 0:i.length)>0,n,"invalid-continue-uri"),d(typeof t.dynamicLinkDomain>"u"||t.dynamicLinkDomain.length>0,n,"invalid-dynamic-link-domain"),e.continueUrl=t.url,e.dynamicLinkDomain=t.dynamicLinkDomain,e.canHandleCodeInApp=t.handleCodeInApp,t.iOS&&(d(t.iOS.bundleId.length>0,n,"missing-ios-bundle-id"),e.iOSBundleId=t.iOS.bundleId),t.android&&(d(t.android.packageName.length>0,n,"missing-android-pkg-name"),e.androidInstallApp=t.android.installApp,e.androidMinimumVersionCode=t.android.minimumVersion,e.androidPackageName=t.android.packageName)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Nt(n){const e=f(n);e._getPasswordPolicyInternal()&&await e._updatePasswordPolicy()}async function Wr(n,e,t){const i=f(n),r={requestType:"PASSWORD_RESET",email:e,clientType:"CLIENT_TYPE_WEB"};t&&Je(i,r,t),await we(i,r,"getOobCode",yr)}async function xr(n,e,t){await xn(p(n),{oobCode:e,newPassword:t}).catch(async i=>{throw i.code==="auth/password-does-not-meet-requirements"&&Nt(n),i})}async function Hr(n,e){await _r(p(n),{oobCode:e})}async function Kn(n,e){const t=p(n),i=await xn(t,{oobCode:e}),r=i.requestType;switch(d(r,t,"internal-error"),r){case"EMAIL_SIGNIN":break;case"VERIFY_AND_CHANGE_EMAIL":d(i.newEmail,t,"internal-error");break;case"REVERT_SECOND_FACTOR_ADDITION":d(i.mfaInfo,t,"internal-error");default:d(i.email,t,"internal-error")}let s=null;return i.mfaInfo&&(s=Se._fromServerResponse(f(t),i.mfaInfo)),{data:{email:(i.requestType==="VERIFY_AND_CHANGE_EMAIL"?i.newEmail:i.email)||null,previousEmail:(i.requestType==="VERIFY_AND_CHANGE_EMAIL"?i.email:i.newEmail)||null,multiFactorInfo:s},operation:r}}async function qr(n,e){const{data:t}=await Kn(p(n),e);return t.email}async function jr(n,e,t){if(_(n.app))return Promise.reject(y(n));const i=f(n),o=await we(i,{returnSecureToken:!0,email:e,password:t,clientType:"CLIENT_TYPE_WEB"},"signUpPassword",Hn).catch(c=>{throw c.code==="auth/password-does-not-meet-requirements"&&Nt(n),c}),a=await b._fromIdTokenResponse(i,"signIn",o);return await i._updateCurrentUser(a.user),a}function zr(n,e,t){return _(n.app)?Promise.reject(y(n)):Ke(p(n),G.credential(e,t)).catch(async i=>{throw i.code==="auth/password-does-not-meet-requirements"&&Nt(n),i})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Gr(n,e,t){const i=f(n),r={requestType:"EMAIL_SIGNIN",email:e,clientType:"CLIENT_TYPE_WEB"};function s(o,a){d(a.handleCodeInApp,i,"argument-error"),a&&Je(i,o,a)}s(r,t),await we(i,r,"getOobCode",wr)}function Br(n,e){const t=Be.parseLink(e);return(t==null?void 0:t.operation)==="EMAIL_SIGNIN"}async function $r(n,e,t){if(_(n.app))return Promise.reject(y(n));const i=p(n),r=G.credentialWithLink(e,t||Ie());return d(r._tenantId===(i.tenantId||null),i,"tenant-id-mismatch"),Ke(i,r)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Kr(n,e){return g(n,"POST","/v1/accounts:createAuthUri",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Jr(n,e){const t=Rt()?Ie():"http://localhost",i={identifier:e,continueUri:t},{signinMethods:r}=await Kr(p(n),i);return r||[]}async function Yr(n,e){const t=p(n),r={requestType:"VERIFY_EMAIL",idToken:await n.getIdToken()};e&&Je(t.auth,r,e);const{email:s}=await Ir(t.auth,r);s!==n.email&&await n.reload()}async function Xr(n,e,t){const i=p(n),s={requestType:"VERIFY_AND_CHANGE_EMAIL",idToken:await n.getIdToken(),newEmail:e};t&&Je(i.auth,s,t);const{email:o}=await Tr(i.auth,s);o!==n.email&&await n.reload()}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Qr(n,e){return g(n,"POST","/v1/accounts:update",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Zr(n,{displayName:e,photoURL:t}){if(e===void 0&&t===void 0)return;const i=p(n),s={idToken:await i.getIdToken(),displayName:e,photoUrl:t,returnSecureToken:!0},o=await W(i,Qr(i.auth,s));i.displayName=o.displayName||null,i.photoURL=o.photoUrl||null;const a=i.providerData.find(({providerId:c})=>c==="password");a&&(a.displayName=i.displayName,a.photoURL=i.photoURL),await i._updateTokensIfNecessary(o)}function es(n,e){const t=p(n);return _(t.auth.app)?Promise.reject(y(t.auth)):Jn(t,e,null)}function ts(n,e){return Jn(p(n),null,e)}async function Jn(n,e,t){const{auth:i}=n,s={idToken:await n.getIdToken(),returnSecureToken:!0};e&&(s.email=e),t&&(s.password=t);const o=await W(n,mr(i,s));await n._updateTokensIfNecessary(o,!0)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ns(n){var e,t;if(!n)return null;const{providerId:i}=n,r=n.rawUserInfo?JSON.parse(n.rawUserInfo):{},s=n.isNewUser||n.kind==="identitytoolkit#SignupNewUserResponse";if(!i&&(n!=null&&n.idToken)){const o=(t=(e=ze(n.idToken))===null||e===void 0?void 0:e.firebase)===null||t===void 0?void 0:t.sign_in_provider;if(o){const a=o!=="anonymous"&&o!=="custom"?o:null;return new re(s,a)}}if(!i)return null;switch(i){case"facebook.com":return new is(s,r);case"github.com":return new rs(s,r);case"google.com":return new ss(s,r);case"twitter.com":return new os(s,r,n.screenName||null);case"custom":case"anonymous":return new re(s,null);default:return new re(s,i,r)}}class re{constructor(e,t,i={}){this.isNewUser=e,this.providerId=t,this.profile=i}}class Yn extends re{constructor(e,t,i,r){super(e,t,i),this.username=r}}class is extends re{constructor(e,t){super(e,"facebook.com",t)}}class rs extends Yn{constructor(e,t){super(e,"github.com",t,typeof(t==null?void 0:t.login)=="string"?t==null?void 0:t.login:null)}}class ss extends re{constructor(e,t){super(e,"google.com",t)}}class os extends Yn{constructor(e,t,i){super(e,"twitter.com",t,i)}}function as(n){const{user:e,_tokenResponse:t}=n;return e.isAnonymous&&!t?{providerId:null,isNewUser:!1,profile:null}:ns(t)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class B{constructor(e,t,i){this.type=e,this.credential=t,this.user=i}static _fromIdtoken(e,t){return new B("enroll",e,t)}static _fromMfaPendingCredential(e){return new B("signin",e)}toJSON(){return{multiFactorSession:{[this.type==="enroll"?"idToken":"pendingCredential"]:this.credential}}}static fromJSON(e){var t,i;if(e!=null&&e.multiFactorSession){if(!((t=e.multiFactorSession)===null||t===void 0)&&t.pendingCredential)return B._fromMfaPendingCredential(e.multiFactorSession.pendingCredential);if(!((i=e.multiFactorSession)===null||i===void 0)&&i.idToken)return B._fromIdtoken(e.multiFactorSession.idToken)}return null}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ot{constructor(e,t,i){this.session=e,this.hints=t,this.signInResolver=i}static _fromError(e,t){const i=f(e),r=t.customData._serverResponse,s=(r.mfaInfo||[]).map(a=>Se._fromServerResponse(i,a));d(r.mfaPendingCredential,i,"internal-error");const o=B._fromMfaPendingCredential(r.mfaPendingCredential);return new Ot(o,s,async a=>{const c=await a._process(i,o);delete r.mfaInfo,delete r.mfaPendingCredential;const l=Object.assign(Object.assign({},r),{idToken:c.idToken,refreshToken:c.refreshToken});switch(t.operationType){case"signIn":const u=await b._fromIdTokenResponse(i,t.operationType,l);return await i._updateCurrentUser(u.user),u;case"reauthenticate":return d(t.user,i,"internal-error"),b._forOperation(t.user,t.operationType,l);default:T(i,"internal-error")}})}async resolveSignIn(e){const t=e;return this.signInResolver(t)}}function cs(n,e){var t;const i=p(n),r=e;return d(e.customData.operationType,i,"argument-error"),d((t=r.customData._serverResponse)===null||t===void 0?void 0:t.mfaPendingCredential,i,"argument-error"),Ot._fromError(i,r)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ds(n,e){return g(n,"POST","/v2/accounts/mfaEnrollment:start",m(n,e))}function ls(n,e){return g(n,"POST","/v2/accounts/mfaEnrollment:finalize",m(n,e))}function us(n,e){return g(n,"POST","/v2/accounts/mfaEnrollment:withdraw",m(n,e))}class Lt{constructor(e){this.user=e,this.enrolledFactors=[],e._onReload(t=>{t.mfaInfo&&(this.enrolledFactors=t.mfaInfo.map(i=>Se._fromServerResponse(e.auth,i)))})}static _fromUser(e){return new Lt(e)}async getSession(){return B._fromIdtoken(await this.user.getIdToken(),this.user)}async enroll(e,t){const i=e,r=await this.getSession(),s=await W(this.user,i._process(this.user.auth,r,t));return await this.user._updateTokensIfNecessary(s),this.user.reload()}async unenroll(e){const t=typeof e=="string"?e:e.uid,i=await this.user.getIdToken();try{const r=await W(this.user,us(this.user.auth,{idToken:i,mfaEnrollmentId:t}));this.enrolledFactors=this.enrolledFactors.filter(({uid:s})=>s!==t),await this.user._updateTokensIfNecessary(r),await this.user.reload()}catch(r){throw r}}}const st=new WeakMap;function hs(n){const e=p(n);return st.has(e)||st.set(e,Lt._fromUser(e)),st.get(e)}const qe="__sak";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Xn{constructor(e,t){this.storageRetriever=e,this.type=t}_isAvailable(){try{return this.storage?(this.storage.setItem(qe,"1"),this.storage.removeItem(qe),Promise.resolve(!0)):Promise.resolve(!1)}catch{return Promise.resolve(!1)}}_set(e,t){return this.storage.setItem(e,JSON.stringify(t)),Promise.resolve()}_get(e){const t=this.storage.getItem(e);return Promise.resolve(t?JSON.parse(t):null)}_remove(e){return this.storage.removeItem(e),Promise.resolve()}get storage(){return this.storageRetriever()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ps=1e3,fs=10;class Qn extends Xn{constructor(){super(()=>window.localStorage,"LOCAL"),this.boundEventHandler=(e,t)=>this.onStorageEvent(e,t),this.listeners={},this.localCache={},this.pollTimer=null,this.fallbackToPolling=Mn(),this._shouldAllowMigration=!0}forAllChangedKeys(e){for(const t of Object.keys(this.listeners)){const i=this.storage.getItem(t),r=this.localCache[t];i!==r&&e(t,r,i)}}onStorageEvent(e,t=!1){if(!e.key){this.forAllChangedKeys((o,a,c)=>{this.notifyListeners(o,c)});return}const i=e.key;t?this.detachListener():this.stopPolling();const r=()=>{const o=this.storage.getItem(i);!t&&this.localCache[i]===o||this.notifyListeners(i,o)},s=this.storage.getItem(i);Qi()&&s!==e.newValue&&e.newValue!==e.oldValue?setTimeout(r,fs):r()}notifyListeners(e,t){this.localCache[e]=t;const i=this.listeners[e];if(i)for(const r of Array.from(i))r(t&&JSON.parse(t))}startPolling(){this.stopPolling(),this.pollTimer=setInterval(()=>{this.forAllChangedKeys((e,t,i)=>{this.onStorageEvent(new StorageEvent("storage",{key:e,oldValue:t,newValue:i}),!0)})},ps)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}attachListener(){window.addEventListener("storage",this.boundEventHandler)}detachListener(){window.removeEventListener("storage",this.boundEventHandler)}_addListener(e,t){Object.keys(this.listeners).length===0&&(this.fallbackToPolling?this.startPolling():this.attachListener()),this.listeners[e]||(this.listeners[e]=new Set,this.localCache[e]=this.storage.getItem(e)),this.listeners[e].add(t)}_removeListener(e,t){this.listeners[e]&&(this.listeners[e].delete(t),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&(this.detachListener(),this.stopPolling())}async _set(e,t){await super._set(e,t),this.localCache[e]=JSON.stringify(t)}async _get(e){const t=await super._get(e);return this.localCache[e]=JSON.stringify(t),t}async _remove(e){await super._remove(e),delete this.localCache[e]}}Qn.type="LOCAL";const Dt=Qn;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Zn extends Xn{constructor(){super(()=>window.sessionStorage,"SESSION")}_addListener(e,t){}_removeListener(e,t){}}Zn.type="SESSION";const J=Zn;/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ms(n){return Promise.all(n.map(async e=>{try{return{fulfilled:!0,value:await e}}catch(t){return{fulfilled:!1,reason:t}}}))}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ye{constructor(e){this.eventTarget=e,this.handlersMap={},this.boundEventHandler=this.handleEvent.bind(this)}static _getInstance(e){const t=this.receivers.find(r=>r.isListeningto(e));if(t)return t;const i=new Ye(e);return this.receivers.push(i),i}isListeningto(e){return this.eventTarget===e}async handleEvent(e){const t=e,{eventId:i,eventType:r,data:s}=t.data,o=this.handlersMap[r];if(!(o!=null&&o.size))return;t.ports[0].postMessage({status:"ack",eventId:i,eventType:r});const a=Array.from(o).map(async l=>l(t.origin,s)),c=await ms(a);t.ports[0].postMessage({status:"done",eventId:i,eventType:r,response:c})}_subscribe(e,t){Object.keys(this.handlersMap).length===0&&this.eventTarget.addEventListener("message",this.boundEventHandler),this.handlersMap[e]||(this.handlersMap[e]=new Set),this.handlersMap[e].add(t)}_unsubscribe(e,t){this.handlersMap[e]&&t&&this.handlersMap[e].delete(t),(!t||this.handlersMap[e].size===0)&&delete this.handlersMap[e],Object.keys(this.handlersMap).length===0&&this.eventTarget.removeEventListener("message",this.boundEventHandler)}}Ye.receivers=[];/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ce(n="",e=10){let t="";for(let i=0;i<e;i++)t+=Math.floor(Math.random()*10);return n+t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class gs{constructor(e){this.target=e,this.handlers=new Set}removeMessageHandler(e){e.messageChannel&&(e.messageChannel.port1.removeEventListener("message",e.onMessage),e.messageChannel.port1.close()),this.handlers.delete(e)}async _send(e,t,i=50){const r=typeof MessageChannel<"u"?new MessageChannel:null;if(!r)throw new Error("connection_unavailable");let s,o;return new Promise((a,c)=>{const l=Ce("",20);r.port1.start();const u=setTimeout(()=>{c(new Error("unsupported_event"))},i);o={messageChannel:r,onMessage(h){const E=h;if(E.data.eventId===l)switch(E.data.status){case"ack":clearTimeout(u),s=setTimeout(()=>{c(new Error("timeout"))},3e3);break;case"done":clearTimeout(s),a(E.data.response);break;default:clearTimeout(u),clearTimeout(s),c(new Error("invalid_response"));break}}},this.handlers.add(o),r.port1.addEventListener("message",o.onMessage),this.target.postMessage({eventType:e,eventId:l,data:t},[r.port2])}).finally(()=>{o&&this.removeMessageHandler(o)})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function v(){return window}function _s(n){v().location.href=n}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ut(){return typeof v().WorkerGlobalScope<"u"&&typeof v().importScripts=="function"}async function vs(){if(!(navigator!=null&&navigator.serviceWorker))return null;try{return(await navigator.serviceWorker.ready).active}catch{return null}}function Is(){var n;return((n=navigator==null?void 0:navigator.serviceWorker)===null||n===void 0?void 0:n.controller)||null}function ys(){return Ut()?self:null}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ei="firebaseLocalStorageDb",ws=1,je="firebaseLocalStorage",ti="fbase_key";class Ne{constructor(e){this.request=e}toPromise(){return new Promise((e,t)=>{this.request.addEventListener("success",()=>{e(this.request.result)}),this.request.addEventListener("error",()=>{t(this.request.error)})})}}function Xe(n,e){return n.transaction([je],e?"readwrite":"readonly").objectStore(je)}function Ts(){const n=indexedDB.deleteDatabase(ei);return new Ne(n).toPromise()}function ht(){const n=indexedDB.open(ei,ws);return new Promise((e,t)=>{n.addEventListener("error",()=>{t(n.error)}),n.addEventListener("upgradeneeded",()=>{const i=n.result;try{i.createObjectStore(je,{keyPath:ti})}catch(r){t(r)}}),n.addEventListener("success",async()=>{const i=n.result;i.objectStoreNames.contains(je)?e(i):(i.close(),await Ts(),e(await ht()))})})}async function cn(n,e,t){const i=Xe(n,!0).put({[ti]:e,value:t});return new Ne(i).toPromise()}async function Es(n,e){const t=Xe(n,!1).get(e),i=await new Ne(t).toPromise();return i===void 0?null:i.value}function dn(n,e){const t=Xe(n,!0).delete(e);return new Ne(t).toPromise()}const ks=800,Rs=3;class ni{constructor(){this.type="LOCAL",this._shouldAllowMigration=!0,this.listeners={},this.localCache={},this.pollTimer=null,this.pendingWrites=0,this.receiver=null,this.sender=null,this.serviceWorkerReceiverAvailable=!1,this.activeServiceWorker=null,this._workerInitializationPromise=this.initializeServiceWorkerMessaging().then(()=>{},()=>{})}async _openDb(){return this.db?this.db:(this.db=await ht(),this.db)}async _withRetries(e){let t=0;for(;;)try{const i=await this._openDb();return await e(i)}catch(i){if(t++>Rs)throw i;this.db&&(this.db.close(),this.db=void 0)}}async initializeServiceWorkerMessaging(){return Ut()?this.initializeReceiver():this.initializeSender()}async initializeReceiver(){this.receiver=Ye._getInstance(ys()),this.receiver._subscribe("keyChanged",async(e,t)=>({keyProcessed:(await this._poll()).includes(t.key)})),this.receiver._subscribe("ping",async(e,t)=>["keyChanged"])}async initializeSender(){var e,t;if(this.activeServiceWorker=await vs(),!this.activeServiceWorker)return;this.sender=new gs(this.activeServiceWorker);const i=await this.sender._send("ping",{},800);i&&!((e=i[0])===null||e===void 0)&&e.fulfilled&&!((t=i[0])===null||t===void 0)&&t.value.includes("keyChanged")&&(this.serviceWorkerReceiverAvailable=!0)}async notifyServiceWorker(e){if(!(!this.sender||!this.activeServiceWorker||Is()!==this.activeServiceWorker))try{await this.sender._send("keyChanged",{key:e},this.serviceWorkerReceiverAvailable?800:50)}catch{}}async _isAvailable(){try{if(!indexedDB)return!1;const e=await ht();return await cn(e,qe,"1"),await dn(e,qe),!0}catch{}return!1}async _withPendingWrite(e){this.pendingWrites++;try{await e()}finally{this.pendingWrites--}}async _set(e,t){return this._withPendingWrite(async()=>(await this._withRetries(i=>cn(i,e,t)),this.localCache[e]=t,this.notifyServiceWorker(e)))}async _get(e){const t=await this._withRetries(i=>Es(i,e));return this.localCache[e]=t,t}async _remove(e){return this._withPendingWrite(async()=>(await this._withRetries(t=>dn(t,e)),delete this.localCache[e],this.notifyServiceWorker(e)))}async _poll(){const e=await this._withRetries(r=>{const s=Xe(r,!1).getAll();return new Ne(s).toPromise()});if(!e)return[];if(this.pendingWrites!==0)return[];const t=[],i=new Set;if(e.length!==0)for(const{fbase_key:r,value:s}of e)i.add(r),JSON.stringify(this.localCache[r])!==JSON.stringify(s)&&(this.notifyListeners(r,s),t.push(r));for(const r of Object.keys(this.localCache))this.localCache[r]&&!i.has(r)&&(this.notifyListeners(r,null),t.push(r));return t}notifyListeners(e,t){this.localCache[e]=t;const i=this.listeners[e];if(i)for(const r of Array.from(i))r(t)}startPolling(){this.stopPolling(),this.pollTimer=setInterval(async()=>this._poll(),ks)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}_addListener(e,t){Object.keys(this.listeners).length===0&&this.startPolling(),this.listeners[e]||(this.listeners[e]=new Set,this._get(e)),this.listeners[e].add(t)}_removeListener(e,t){this.listeners[e]&&(this.listeners[e].delete(t),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&this.stopPolling()}}ni.type="LOCAL";const Ee=ni;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ps(n,e){return g(n,"POST","/v2/accounts/mfaSignIn:start",m(n,e))}function bs(n,e){return g(n,"POST","/v2/accounts/mfaSignIn:finalize",m(n,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const As=500,Ss=6e4,De=1e12;class Cs{constructor(e){this.auth=e,this.counter=De,this._widgets=new Map}render(e,t){const i=this.counter;return this._widgets.set(i,new Ns(e,this.auth.name,t||{})),this.counter++,i}reset(e){var t;const i=e||De;(t=this._widgets.get(i))===null||t===void 0||t.delete(),this._widgets.delete(i)}getResponse(e){var t;const i=e||De;return((t=this._widgets.get(i))===null||t===void 0?void 0:t.getResponse())||""}async execute(e){var t;const i=e||De;return(t=this._widgets.get(i))===null||t===void 0||t.execute(),""}}class Ns{constructor(e,t,i){this.params=i,this.timerId=null,this.deleted=!1,this.responseToken=null,this.clickHandler=()=>{this.execute()};const r=typeof e=="string"?document.getElementById(e):e;d(r,"argument-error",{appName:t}),this.container=r,this.isVisible=this.params.size!=="invisible",this.isVisible?this.execute():this.container.addEventListener("click",this.clickHandler)}getResponse(){return this.checkIfDeleted(),this.responseToken}delete(){this.checkIfDeleted(),this.deleted=!0,this.timerId&&(clearTimeout(this.timerId),this.timerId=null),this.container.removeEventListener("click",this.clickHandler)}execute(){this.checkIfDeleted(),!this.timerId&&(this.timerId=window.setTimeout(()=>{this.responseToken=Os(50);const{callback:e,"expired-callback":t}=this.params;if(e)try{e(this.responseToken)}catch{}this.timerId=window.setTimeout(()=>{if(this.timerId=null,this.responseToken=null,t)try{t()}catch{}this.isVisible&&this.execute()},Ss)},As))}checkIfDeleted(){if(this.deleted)throw new Error("reCAPTCHA mock was already deleted!")}}function Os(n){const e=[],t="1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";for(let i=0;i<n;i++)e.push(t.charAt(Math.floor(Math.random()*t.length)));return e.join("")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ot=Vn("rcb"),Ls=new Re(3e4,6e4);class Ds{constructor(){var e;this.hostLanguage="",this.counter=0,this.librarySeparatelyLoaded=!!(!((e=v().grecaptcha)===null||e===void 0)&&e.render)}load(e,t=""){return d(Us(t),e,"argument-error"),this.shouldResolveImmediately(t)&&Qt(v().grecaptcha)?Promise.resolve(v().grecaptcha):new Promise((i,r)=>{const s=v().setTimeout(()=>{r(I(e,"network-request-failed"))},Ls.get());v()[ot]=()=>{v().clearTimeout(s),delete v()[ot];const a=v().grecaptcha;if(!a||!Qt(a)){r(I(e,"internal-error"));return}const c=a.render;a.render=(l,u)=>{const h=c(l,u);return this.counter++,h},this.hostLanguage=t,i(a)};const o=`${sr()}?${ae({onload:ot,render:"explicit",hl:t})}`;bt(o).catch(()=>{clearTimeout(s),r(I(e,"internal-error"))})})}clearedOneInstance(){this.counter--}shouldResolveImmediately(e){var t;return!!(!((t=v().grecaptcha)===null||t===void 0)&&t.render)&&(e===this.hostLanguage||this.counter>0||this.librarySeparatelyLoaded)}}function Us(n){return n.length<=6&&/^\s*[a-zA-Z0-9\-]*\s*$/.test(n)}class Ms{async load(e){return new Cs(e)}clearedOneInstance(){}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ii="recaptcha",Fs={theme:"light",type:"image"};let Vs=class{constructor(e,t,i=Object.assign({},Fs)){this.parameters=i,this.type=ii,this.destroyed=!1,this.widgetId=null,this.tokenChangeListeners=new Set,this.renderPromise=null,this.recaptcha=null,this.auth=f(e),this.isInvisible=this.parameters.size==="invisible",d(typeof document<"u",this.auth,"operation-not-supported-in-this-environment");const r=typeof t=="string"?document.getElementById(t):t;d(r,this.auth,"argument-error"),this.container=r,this.parameters.callback=this.makeTokenCallback(this.parameters.callback),this._recaptchaLoader=this.auth.settings.appVerificationDisabledForTesting?new Ms:new Ds,this.validateStartingState()}async verify(){this.assertNotDestroyed();const e=await this.render(),t=this.getAssertedRecaptcha(),i=t.getResponse(e);return i||new Promise(r=>{const s=o=>{o&&(this.tokenChangeListeners.delete(s),r(o))};this.tokenChangeListeners.add(s),this.isInvisible&&t.execute(e)})}render(){try{this.assertNotDestroyed()}catch(e){return Promise.reject(e)}return this.renderPromise?this.renderPromise:(this.renderPromise=this.makeRenderPromise().catch(e=>{throw this.renderPromise=null,e}),this.renderPromise)}_reset(){this.assertNotDestroyed(),this.widgetId!==null&&this.getAssertedRecaptcha().reset(this.widgetId)}clear(){this.assertNotDestroyed(),this.destroyed=!0,this._recaptchaLoader.clearedOneInstance(),this.isInvisible||this.container.childNodes.forEach(e=>{this.container.removeChild(e)})}validateStartingState(){d(!this.parameters.sitekey,this.auth,"argument-error"),d(this.isInvisible||!this.container.hasChildNodes(),this.auth,"argument-error"),d(typeof document<"u",this.auth,"operation-not-supported-in-this-environment")}makeTokenCallback(e){return t=>{if(this.tokenChangeListeners.forEach(i=>i(t)),typeof e=="function")e(t);else if(typeof e=="string"){const i=v()[e];typeof i=="function"&&i(t)}}}assertNotDestroyed(){d(!this.destroyed,this.auth,"internal-error")}async makeRenderPromise(){if(await this.init(),!this.widgetId){let e=this.container;if(!this.isInvisible){const t=document.createElement("div");e.appendChild(t),e=t}this.widgetId=this.getAssertedRecaptcha().render(e,this.parameters)}return this.widgetId}async init(){d(Rt()&&!Ut(),this.auth,"internal-error"),await Ws(),this.recaptcha=await this._recaptchaLoader.load(this.auth,this.auth.languageCode||void 0);const e=await Wi(this.auth);d(e,this.auth,"internal-error"),this.parameters.sitekey=e}getAssertedRecaptcha(){return d(this.recaptcha,this.auth,"internal-error"),this.recaptcha}};function Ws(){let n=null;return new Promise(e=>{if(document.readyState==="complete"){e();return}n=()=>e(),window.addEventListener("load",n)}).catch(e=>{throw n&&window.removeEventListener("load",n),e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Mt{constructor(e,t){this.verificationId=e,this.onConfirmation=t}confirm(e){const t=K._fromVerification(this.verificationId,e);return this.onConfirmation(t)}}async function xs(n,e,t){if(_(n.app))return Promise.reject(y(n));const i=f(n),r=await Qe(i,e,p(t));return new Mt(r,s=>Ke(i,s))}async function Hs(n,e,t){const i=p(n);await $e(!1,i,"phone");const r=await Qe(i.auth,e,p(t));return new Mt(r,s=>Bn(i,s))}async function qs(n,e,t){const i=p(n);if(_(i.auth.app))return Promise.reject(y(i.auth));const r=await Qe(i.auth,e,p(t));return new Mt(r,s=>$n(i,s))}async function Qe(n,e,t){var i;const r=await t.verify();try{d(typeof r=="string",n,"argument-error"),d(t.type===ii,n,"argument-error");let s;if(typeof e=="string"?s={phoneNumber:e}:s=e,"session"in s){const o=s.session;if("phoneNumber"in s)return d(o.type==="enroll",n,"internal-error"),(await ds(n,{idToken:o.credential,phoneEnrollmentInfo:{phoneNumber:s.phoneNumber,recaptchaToken:r}})).phoneSessionInfo.sessionInfo;{d(o.type==="signin",n,"internal-error");const a=((i=s.multiFactorHint)===null||i===void 0?void 0:i.uid)||s.multiFactorUid;return d(a,n,"missing-multi-factor-info"),(await Ps(n,{mfaPendingCredential:o.credential,mfaEnrollmentId:a,phoneSignInInfo:{recaptchaToken:r}})).phoneResponseInfo.sessionInfo}}else{const{sessionInfo:o}=await Pr(n,{phoneNumber:s.phoneNumber,recaptchaToken:r});return o}}finally{t._reset()}}async function js(n,e){const t=p(n);if(_(t.auth.app))return Promise.reject(y(t.auth));await At(t,e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Y=class Me{constructor(e){this.providerId=Me.PROVIDER_ID,this.auth=f(e)}verifyPhoneNumber(e,t){return Qe(this.auth,e,p(t))}static credential(e,t){return K._fromVerification(e,t)}static credentialFromResult(e){const t=e;return Me.credentialFromTaggedObject(t)}static credentialFromError(e){return Me.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{phoneNumber:t,temporaryProof:i}=e;return t&&i?K._fromTokenResponse(t,i):null}};Y.PROVIDER_ID="phone";Y.PHONE_SIGN_IN_METHOD="phone";/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Q(n,e){return e?P(e):(d(n._popupRedirectResolver,n,"argument-error"),n._popupRedirectResolver)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ft extends de{constructor(e){super("custom","custom"),this.params=e}_getIdTokenResponse(e){return V(e,this._buildIdpRequest())}_linkToIdToken(e,t){return V(e,this._buildIdpRequest(t))}_getReauthenticationResolver(e){return V(e,this._buildIdpRequest())}_buildIdpRequest(e){const t={requestUri:this.params.requestUri,sessionId:this.params.sessionId,postBody:this.params.postBody,tenantId:this.params.tenantId,pendingToken:this.params.pendingToken,returnSecureToken:!0,returnIdpCredential:!0};return e&&(t.idToken=e),t}}function zs(n){return Gn(n.auth,new Ft(n),n.bypassAuthState)}function Gs(n){const{auth:e,user:t}=n;return d(t,e,"internal-error"),zn(t,new Ft(n),n.bypassAuthState)}async function Bs(n){const{auth:e,user:t}=n;return d(t,e,"internal-error"),At(t,new Ft(n),n.bypassAuthState)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ri{constructor(e,t,i,r,s=!1){this.auth=e,this.resolver=i,this.user=r,this.bypassAuthState=s,this.pendingPromise=null,this.eventManager=null,this.filter=Array.isArray(t)?t:[t]}execute(){return new Promise(async(e,t)=>{this.pendingPromise={resolve:e,reject:t};try{this.eventManager=await this.resolver._initialize(this.auth),await this.onExecution(),this.eventManager.registerConsumer(this)}catch(i){this.reject(i)}})}async onAuthEvent(e){const{urlResponse:t,sessionId:i,postBody:r,tenantId:s,error:o,type:a}=e;if(o){this.reject(o);return}const c={auth:this.auth,requestUri:t,sessionId:i,tenantId:s||void 0,postBody:r||void 0,user:this.user,bypassAuthState:this.bypassAuthState};try{this.resolve(await this.getIdpTask(a)(c))}catch(l){this.reject(l)}}onError(e){this.reject(e)}getIdpTask(e){switch(e){case"signInViaPopup":case"signInViaRedirect":return zs;case"linkViaPopup":case"linkViaRedirect":return Bs;case"reauthViaPopup":case"reauthViaRedirect":return Gs;default:T(this.auth,"internal-error")}}resolve(e){A(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.resolve(e),this.unregisterAndCleanUp()}reject(e){A(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.reject(e),this.unregisterAndCleanUp()}unregisterAndCleanUp(){this.eventManager&&this.eventManager.unregisterConsumer(this),this.pendingPromise=null,this.cleanUp()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const $s=new Re(2e3,1e4);async function Ks(n,e,t){if(_(n.app))return Promise.reject(I(n,"operation-not-supported-in-this-environment"));const i=f(n);ce(n,e,H);const r=Q(i,t);return new M(i,"signInViaPopup",e,r).executeNotNull()}async function Js(n,e,t){const i=p(n);if(_(i.auth.app))return Promise.reject(I(i.auth,"operation-not-supported-in-this-environment"));ce(i.auth,e,H);const r=Q(i.auth,t);return new M(i.auth,"reauthViaPopup",e,r,i).executeNotNull()}async function Ys(n,e,t){const i=p(n);ce(i.auth,e,H);const r=Q(i.auth,t);return new M(i.auth,"linkViaPopup",e,r,i).executeNotNull()}class M extends ri{constructor(e,t,i,r,s){super(e,t,r,s),this.provider=i,this.authWindow=null,this.pollId=null,M.currentPopupAction&&M.currentPopupAction.cancel(),M.currentPopupAction=this}async executeNotNull(){const e=await this.execute();return d(e,this.auth,"internal-error"),e}async onExecution(){A(this.filter.length===1,"Popup operations only handle one event");const e=Ce();this.authWindow=await this.resolver._openPopup(this.auth,this.provider,this.filter[0],e),this.authWindow.associatedEvent=e,this.resolver._originValidation(this.auth).catch(t=>{this.reject(t)}),this.resolver._isIframeWebStorageSupported(this.auth,t=>{t||this.reject(I(this.auth,"web-storage-unsupported"))}),this.pollUserCancellation()}get eventId(){var e;return((e=this.authWindow)===null||e===void 0?void 0:e.associatedEvent)||null}cancel(){this.reject(I(this.auth,"cancelled-popup-request"))}cleanUp(){this.authWindow&&this.authWindow.close(),this.pollId&&window.clearTimeout(this.pollId),this.authWindow=null,this.pollId=null,M.currentPopupAction=null}pollUserCancellation(){const e=()=>{var t,i;if(!((i=(t=this.authWindow)===null||t===void 0?void 0:t.window)===null||i===void 0)&&i.closed){this.pollId=window.setTimeout(()=>{this.pollId=null,this.reject(I(this.auth,"popup-closed-by-user"))},8e3);return}this.pollId=window.setTimeout(e,$s.get())};e()}}M.currentPopupAction=null;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Xs="pendingRedirect",_e=new Map;class Qs extends ri{constructor(e,t,i=!1){super(e,["signInViaRedirect","linkViaRedirect","reauthViaRedirect","unknown"],t,void 0,i),this.eventId=null}async execute(){let e=_e.get(this.auth._key());if(!e){try{const i=await Zs(this.resolver,this.auth)?await super.execute():null;e=()=>Promise.resolve(i)}catch(t){e=()=>Promise.reject(t)}_e.set(this.auth._key(),e)}return this.bypassAuthState||_e.set(this.auth._key(),()=>Promise.resolve(null)),e()}async onAuthEvent(e){if(e.type==="signInViaRedirect")return super.onAuthEvent(e);if(e.type==="unknown"){this.resolve(null);return}if(e.eventId){const t=await this.auth._redirectUserForId(e.eventId);if(t)return this.user=t,super.onAuthEvent(e);this.resolve(null)}}async onExecution(){}cleanUp(){}}async function Zs(n,e){const t=oi(e),i=si(n);if(!await i._isAvailable())return!1;const r=await i._get(t)==="true";return await i._remove(t),r}async function Vt(n,e){return si(n)._set(oi(e),"true")}function eo(){_e.clear()}function Wt(n,e){_e.set(n._key(),e)}function si(n){return P(n._redirectPersistence)}function oi(n){return $(Xs,n.config.apiKey,n.name)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function to(n,e,t){return no(n,e,t)}async function no(n,e,t){if(_(n.app))return Promise.reject(y(n));const i=f(n);ce(n,e,H),await i._initializationPromise;const r=Q(i,t);return await Vt(r,i),r._openRedirect(i,e,"signInViaRedirect")}function io(n,e,t){return ro(n,e,t)}async function ro(n,e,t){const i=p(n);if(ce(i.auth,e,H),_(i.auth.app))return Promise.reject(y(i.auth));await i.auth._initializationPromise;const r=Q(i.auth,t);await Vt(r,i.auth);const s=await ai(i);return r._openRedirect(i.auth,e,"reauthViaRedirect",s)}function so(n,e,t){return oo(n,e,t)}async function oo(n,e,t){const i=p(n);ce(i.auth,e,H),await i.auth._initializationPromise;const r=Q(i.auth,t);await $e(!1,i,e.providerId),await Vt(r,i.auth);const s=await ai(i);return r._openRedirect(i.auth,e,"linkViaRedirect",s)}async function ao(n,e){return await f(n)._initializationPromise,Ze(n,e,!1)}async function Ze(n,e,t=!1){if(_(n.app))return Promise.reject(y(n));const i=f(n),r=Q(i,e),o=await new Qs(i,r,t).execute();return o&&!t&&(delete o.user._redirectEventId,await i._persistUserIfCurrent(o.user),await i._setRedirectUser(null,e)),o}async function ai(n){const e=Ce(`${n.uid}:::`);return n._redirectEventId=e,await n.auth._setRedirectUser(n),await n.auth._persistUserIfCurrent(n),e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const co=10*60*1e3;class ci{constructor(e){this.auth=e,this.cachedEventUids=new Set,this.consumers=new Set,this.queuedRedirectEvent=null,this.hasHandledPotentialRedirect=!1,this.lastProcessedEventTime=Date.now()}registerConsumer(e){this.consumers.add(e),this.queuedRedirectEvent&&this.isEventForConsumer(this.queuedRedirectEvent,e)&&(this.sendToConsumer(this.queuedRedirectEvent,e),this.saveEventToCache(this.queuedRedirectEvent),this.queuedRedirectEvent=null)}unregisterConsumer(e){this.consumers.delete(e)}onEvent(e){if(this.hasEventBeenHandled(e))return!1;let t=!1;return this.consumers.forEach(i=>{this.isEventForConsumer(e,i)&&(t=!0,this.sendToConsumer(e,i),this.saveEventToCache(e))}),this.hasHandledPotentialRedirect||!lo(e)||(this.hasHandledPotentialRedirect=!0,t||(this.queuedRedirectEvent=e,t=!0)),t}sendToConsumer(e,t){var i;if(e.error&&!di(e)){const r=((i=e.error.code)===null||i===void 0?void 0:i.split("auth/")[1])||"internal-error";t.onError(I(this.auth,r))}else t.onAuthEvent(e)}isEventForConsumer(e,t){const i=t.eventId===null||!!e.eventId&&e.eventId===t.eventId;return t.filter.includes(e.type)&&i}hasEventBeenHandled(e){return Date.now()-this.lastProcessedEventTime>=co&&this.cachedEventUids.clear(),this.cachedEventUids.has(ln(e))}saveEventToCache(e){this.cachedEventUids.add(ln(e)),this.lastProcessedEventTime=Date.now()}}function ln(n){return[n.type,n.eventId,n.sessionId,n.tenantId].filter(e=>e).join("-")}function di({type:n,error:e}){return n==="unknown"&&(e==null?void 0:e.code)==="auth/no-auth-event"}function lo(n){switch(n.type){case"signInViaRedirect":case"linkViaRedirect":case"reauthViaRedirect":return!0;case"unknown":return di(n);default:return!1}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function li(n,e={}){return g(n,"GET","/v1/projects",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const uo=/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,ho=/^https?/;async function po(n){if(n.config.emulator)return;const{authorizedDomains:e}=await li(n);for(const t of e)try{if(fo(t))return}catch{}T(n,"unauthorized-domain")}function fo(n){const e=Ie(),{protocol:t,hostname:i}=new URL(e);if(n.startsWith("chrome-extension://")){const o=new URL(n);return o.hostname===""&&i===""?t==="chrome-extension:"&&n.replace("chrome-extension://","")===e.replace("chrome-extension://",""):t==="chrome-extension:"&&o.hostname===i}if(!ho.test(t))return!1;if(uo.test(n))return i===n;const r=n.replace(/\./g,"\\.");return new RegExp("^(.+\\."+r+"|"+r+")$","i").test(i)}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const mo=new Re(3e4,6e4);function un(){const n=v().___jsl;if(n!=null&&n.H){for(const e of Object.keys(n.H))if(n.H[e].r=n.H[e].r||[],n.H[e].L=n.H[e].L||[],n.H[e].r=[...n.H[e].L],n.CP)for(let t=0;t<n.CP.length;t++)n.CP[t]=null}}function go(n){return new Promise((e,t)=>{var i,r,s;function o(){un(),gapi.load("gapi.iframes",{callback:()=>{e(gapi.iframes.getContext())},ontimeout:()=>{un(),t(I(n,"network-request-failed"))},timeout:mo.get()})}if(!((r=(i=v().gapi)===null||i===void 0?void 0:i.iframes)===null||r===void 0)&&r.Iframe)e(gapi.iframes.getContext());else if(!((s=v().gapi)===null||s===void 0)&&s.load)o();else{const a=Vn("iframefcb");return v()[a]=()=>{gapi.load?o():t(I(n,"network-request-failed"))},bt(`${ar()}?onload=${a}`).catch(c=>t(c))}}).catch(e=>{throw Fe=null,e})}let Fe=null;function _o(n){return Fe=Fe||go(n),Fe}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const vo=new Re(5e3,15e3),Io="__/auth/iframe",yo="emulator/auth/iframe",wo={style:{position:"absolute",top:"-100px",width:"1px",height:"1px"},"aria-hidden":"true",tabindex:"-1"},To=new Map([["identitytoolkit.googleapis.com","p"],["staging-identitytoolkit.sandbox.googleapis.com","s"],["test-identitytoolkit.sandbox.googleapis.com","t"]]);function Eo(n){const e=n.config;d(e.authDomain,n,"auth-domain-config-required");const t=e.emulator?Pt(e,yo):`https://${n.config.authDomain}/${Io}`,i={apiKey:e.apiKey,appName:n.name,v:ke},r=To.get(n.config.apiHost);r&&(i.eid=r);const s=n._getFrameworks();return s.length&&(i.fw=s.join(",")),`${t}?${ae(i).slice(1)}`}async function ko(n){const e=await _o(n),t=v().gapi;return d(t,n,"internal-error"),e.open({where:document.body,url:Eo(n),messageHandlersFilter:t.iframes.CROSS_ORIGIN_IFRAMES_FILTER,attributes:wo,dontclear:!0},i=>new Promise(async(r,s)=>{await i.restyle({setHideOnLeave:!1});const o=I(n,"network-request-failed"),a=v().setTimeout(()=>{s(o)},vo.get());function c(){v().clearTimeout(a),r(i)}i.ping(c).then(c,()=>{s(o)})}))}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ro={location:"yes",resizable:"yes",statusbar:"yes",toolbar:"no"},Po=500,bo=600,Ao="_blank",So="http://localhost";class hn{constructor(e){this.window=e,this.associatedEvent=null}close(){if(this.window)try{this.window.close()}catch{}}}function Co(n,e,t,i=Po,r=bo){const s=Math.max((window.screen.availHeight-r)/2,0).toString(),o=Math.max((window.screen.availWidth-i)/2,0).toString();let a="";const c=Object.assign(Object.assign({},Ro),{width:i.toString(),height:r.toString(),top:s,left:o}),l=w().toLowerCase();t&&(a=On(l)?Ao:t),Cn(l)&&(e=e||So,c.scrollbars="yes");const u=Object.entries(c).reduce((E,[Oe,Le])=>`${E}${Oe}=${Le},`,"");if(Xi(l)&&a!=="_self")return No(e||"",a),new hn(null);const h=window.open(e||"",a,u);d(h,n,"popup-blocked");try{h.focus()}catch{}return new hn(h)}function No(n,e){const t=document.createElement("a");t.href=n,t.target=e;const i=document.createEvent("MouseEvent");i.initMouseEvent("click",!0,!0,window,1,0,0,0,0,!1,!1,!1,!1,1,null),t.dispatchEvent(i)}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Oo="__/auth/handler",Lo="emulator/auth/handler",Do=encodeURIComponent("fac");async function pt(n,e,t,i,r,s){d(n.config.authDomain,n,"auth-domain-config-required"),d(n.config.apiKey,n,"invalid-api-key");const o={apiKey:n.config.apiKey,appName:n.name,authType:t,redirectUrl:i,v:ke,eventId:r};if(e instanceof H){e.setDefaultLanguage(n.languageCode),o.providerId=e.providerId||"",Pi(e.getCustomParameters())||(o.customParameters=JSON.stringify(e.getCustomParameters()));for(const[u,h]of Object.entries(s||{}))o[u]=h}if(e instanceof le){const u=e.getScopes().filter(h=>h!=="");u.length>0&&(o.scopes=u.join(","))}n.tenantId&&(o.tid=n.tenantId);const a=o;for(const u of Object.keys(a))a[u]===void 0&&delete a[u];const c=await n._getAppCheckToken(),l=c?`#${Do}=${encodeURIComponent(c)}`:"";return`${Uo(n)}?${ae(a).slice(1)}${l}`}function Uo({config:n}){return n.emulator?Pt(n,Lo):`https://${n.authDomain}/${Oo}`}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const at="webStorageSupport";class Mo{constructor(){this.eventManagers={},this.iframes={},this.originValidationPromises={},this._redirectPersistence=J,this._completeRedirectFn=Ze,this._overrideRedirectResult=Wt}async _openPopup(e,t,i,r){var s;A((s=this.eventManagers[e._key()])===null||s===void 0?void 0:s.manager,"_initialize() not called before _openPopup()");const o=await pt(e,t,i,Ie(),r);return Co(e,o,Ce())}async _openRedirect(e,t,i,r){await this._originValidation(e);const s=await pt(e,t,i,Ie(),r);return _s(s),new Promise(()=>{})}_initialize(e){const t=e._key();if(this.eventManagers[t]){const{manager:r,promise:s}=this.eventManagers[t];return r?Promise.resolve(r):(A(s,"If manager is not set, promise should be"),s)}const i=this.initAndGetManager(e);return this.eventManagers[t]={promise:i},i.catch(()=>{delete this.eventManagers[t]}),i}async initAndGetManager(e){const t=await ko(e),i=new ci(e);return t.register("authEvent",r=>(d(r==null?void 0:r.authEvent,e,"invalid-auth-event"),{status:i.onEvent(r.authEvent)?"ACK":"ERROR"}),gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER),this.eventManagers[e._key()]={manager:i},this.iframes[e._key()]=t,i}_isIframeWebStorageSupported(e,t){this.iframes[e._key()].send(at,{type:at},r=>{var s;const o=(s=r==null?void 0:r[0])===null||s===void 0?void 0:s[at];o!==void 0&&t(!!o),T(e,"internal-error")},gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER)}_originValidation(e){const t=e._key();return this.originValidationPromises[t]||(this.originValidationPromises[t]=po(e)),this.originValidationPromises[t]}get _shouldInitProactively(){return Mn()||Nn()||be()}}const Fo=Mo;class Vo{constructor(e){this.factorId=e}_process(e,t,i){switch(t.type){case"enroll":return this._finalizeEnroll(e,t.credential,i);case"signin":return this._finalizeSignIn(e,t.credential);default:return L("unexpected MultiFactorSessionType")}}}class xt extends Vo{constructor(e){super("phone"),this.credential=e}static _fromCredential(e){return new xt(e)}_finalizeEnroll(e,t,i){return ls(e,{idToken:t,displayName:i,phoneVerificationInfo:this.credential._makeVerificationRequest()})}_finalizeSignIn(e,t){return bs(e,{mfaPendingCredential:t,phoneVerificationInfo:this.credential._makeVerificationRequest()})}}class ui{constructor(){}static assertion(e){return xt._fromCredential(e)}}ui.FACTOR_ID="phone";var pn="@firebase/auth",fn="1.7.9";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Wo{constructor(e){this.auth=e,this.internalListeners=new Map}getUid(){var e;return this.assertAuthConfigured(),((e=this.auth.currentUser)===null||e===void 0?void 0:e.uid)||null}async getToken(e){return this.assertAuthConfigured(),await this.auth._initializationPromise,this.auth.currentUser?{accessToken:await this.auth.currentUser.getIdToken(e)}:null}addAuthTokenListener(e){if(this.assertAuthConfigured(),this.internalListeners.has(e))return;const t=this.auth.onIdTokenChanged(i=>{e((i==null?void 0:i.stsTokenManager.accessToken)||null)});this.internalListeners.set(e,t),this.updateProactiveRefresh()}removeAuthTokenListener(e){this.assertAuthConfigured();const t=this.internalListeners.get(e);t&&(this.internalListeners.delete(e),t(),this.updateProactiveRefresh())}assertAuthConfigured(){d(this.auth._initializationPromise,"dependent-sdk-initialized-before-auth")}updateProactiveRefresh(){this.internalListeners.size>0?this.auth._startProactiveRefresh():this.auth._stopProactiveRefresh()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function xo(n){switch(n){case"Node":return"node";case"ReactNative":return"rn";case"Worker":return"webworker";case"Cordova":return"cordova";case"WebExtension":return"web-extension";default:return}}function Ho(n){Jt(new dt("auth",(e,{options:t})=>{const i=e.getProvider("app").getImmediate(),r=e.getProvider("heartbeat"),s=e.getProvider("app-check-internal"),{apiKey:o,authDomain:a}=i.options;d(o&&!o.includes(":"),"invalid-api-key",{appName:i.name});const c={apiKey:o,authDomain:a,clientPlatform:n,apiHost:"identitytoolkit.googleapis.com",tokenApiHost:"securetoken.googleapis.com",apiScheme:"https",sdkClientVersion:Fn(n)},l=new ir(i,r,s,c);return ur(l,t),l},"PUBLIC").setInstantiationMode("EXPLICIT").setInstanceCreatedCallback((e,t,i)=>{e.getProvider("auth-internal").initialize()})),Jt(new dt("auth-internal",e=>{const t=f(e.getProvider("auth").getImmediate());return(i=>new Wo(i))(t)},"PRIVATE").setInstantiationMode("EXPLICIT")),Yt(pn,fn,xo(n)),Yt(pn,fn,"esm2017")}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const qo=5*60;Ti("authIdTokenMaxAge");function jo(){var n,e;return(e=(n=document.getElementsByTagName("head"))===null||n===void 0?void 0:n[0])!==null&&e!==void 0?e:document}rr({loadJS(n){return new Promise((e,t)=>{const i=document.createElement("script");i.setAttribute("src",n),i.onload=e,i.onerror=r=>{const s=I("internal-error");s.customData=r,t(s)},i.type="text/javascript",i.charset="UTF-8",jo().appendChild(i)})},gapiScript:"https://apis.google.com/js/api.js",recaptchaV2Script:"https://www.google.com/recaptcha/api.js",recaptchaEnterpriseScript:"https://www.google.com/recaptcha/enterprise.js?render="});Ho("Browser");/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function X(){return window}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const zo=2e3;async function Go(n,e,t){var i;const{BuildInfo:r}=X();A(e.sessionId,"AuthEvent did not contain a session ID");const s=await Yo(e.sessionId),o={};return be()?o.ibi=r.packageName:Pe()?o.apn=r.packageName:T(n,"operation-not-supported-in-this-environment"),r.displayName&&(o.appDisplayName=r.displayName),o.sessionId=s,pt(n,t,e.type,void 0,(i=e.eventId)!==null&&i!==void 0?i:void 0,o)}async function Bo(n){const{BuildInfo:e}=X(),t={};be()?t.iosBundleId=e.packageName:Pe()?t.androidPackageName=e.packageName:T(n,"operation-not-supported-in-this-environment"),await li(n,t)}function $o(n){const{cordova:e}=X();return new Promise(t=>{e.plugins.browsertab.isAvailable(i=>{let r=null;i?e.plugins.browsertab.openUrl(n):r=e.InAppBrowser.open(n,Yi()?"_blank":"_system","location=yes"),t(r)})})}async function Ko(n,e,t){const{cordova:i}=X();let r=()=>{};try{await new Promise((s,o)=>{let a=null;function c(){var h;s();const E=(h=i.plugins.browsertab)===null||h===void 0?void 0:h.close;typeof E=="function"&&E(),typeof(t==null?void 0:t.close)=="function"&&t.close()}function l(){a||(a=window.setTimeout(()=>{o(I(n,"redirect-cancelled-by-user"))},zo))}function u(){(document==null?void 0:document.visibilityState)==="visible"&&l()}e.addPassiveListener(c),document.addEventListener("resume",l,!1),Pe()&&document.addEventListener("visibilitychange",u,!1),r=()=>{e.removePassiveListener(c),document.removeEventListener("resume",l,!1),document.removeEventListener("visibilitychange",u,!1),a&&window.clearTimeout(a)}})}finally{r()}}function Jo(n){var e,t,i,r,s,o,a,c,l,u;const h=X();d(typeof((e=h==null?void 0:h.universalLinks)===null||e===void 0?void 0:e.subscribe)=="function",n,"invalid-cordova-configuration",{missingPlugin:"cordova-universal-links-plugin-fix"}),d(typeof((t=h==null?void 0:h.BuildInfo)===null||t===void 0?void 0:t.packageName)<"u",n,"invalid-cordova-configuration",{missingPlugin:"cordova-plugin-buildInfo"}),d(typeof((s=(r=(i=h==null?void 0:h.cordova)===null||i===void 0?void 0:i.plugins)===null||r===void 0?void 0:r.browsertab)===null||s===void 0?void 0:s.openUrl)=="function",n,"invalid-cordova-configuration",{missingPlugin:"cordova-plugin-browsertab"}),d(typeof((c=(a=(o=h==null?void 0:h.cordova)===null||o===void 0?void 0:o.plugins)===null||a===void 0?void 0:a.browsertab)===null||c===void 0?void 0:c.isAvailable)=="function",n,"invalid-cordova-configuration",{missingPlugin:"cordova-plugin-browsertab"}),d(typeof((u=(l=h==null?void 0:h.cordova)===null||l===void 0?void 0:l.InAppBrowser)===null||u===void 0?void 0:u.open)=="function",n,"invalid-cordova-configuration",{missingPlugin:"cordova-plugin-inappbrowser"})}async function Yo(n){const e=Xo(n),t=await crypto.subtle.digest("SHA-256",e);return Array.from(new Uint8Array(t)).map(r=>r.toString(16).padStart(2,"0")).join("")}function Xo(n){if(A(/[0-9a-zA-Z]+/.test(n),"Can only convert alpha-numeric strings"),typeof TextEncoder<"u")return new TextEncoder().encode(n);const e=new ArrayBuffer(n.length),t=new Uint8Array(e);for(let i=0;i<n.length;i++)t[i]=n.charCodeAt(i);return t}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qo=20;class Zo extends ci{constructor(){super(...arguments),this.passiveListeners=new Set,this.initPromise=new Promise(e=>{this.resolveInitialized=e})}addPassiveListener(e){this.passiveListeners.add(e)}removePassiveListener(e){this.passiveListeners.delete(e)}resetRedirect(){this.queuedRedirectEvent=null,this.hasHandledPotentialRedirect=!1}onEvent(e){return this.resolveInitialized(),this.passiveListeners.forEach(t=>t(e)),super.onEvent(e)}async initialized(){await this.initPromise}}function ea(n,e,t=null){return{type:e,eventId:t,urlResponse:null,sessionId:ia(),postBody:null,tenantId:n.tenantId,error:I(n,"no-auth-event")}}function ta(n,e){return ft()._set(mt(n),e)}async function mn(n){const e=await ft()._get(mt(n));return e&&await ft()._remove(mt(n)),e}function na(n,e){var t,i;const r=sa(e);if(r.includes("/__/auth/callback")){const s=Ve(r),o=s.firebaseError?ra(decodeURIComponent(s.firebaseError)):null,a=(i=(t=o==null?void 0:o.code)===null||t===void 0?void 0:t.split("auth/"))===null||i===void 0?void 0:i[1],c=a?I(a):null;return c?{type:n.type,eventId:n.eventId,tenantId:n.tenantId,error:c,urlResponse:null,sessionId:null,postBody:null}:{type:n.type,eventId:n.eventId,tenantId:n.tenantId,sessionId:n.sessionId,urlResponse:r,postBody:null}}return null}function ia(){const n=[],e="1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";for(let t=0;t<Qo;t++){const i=Math.floor(Math.random()*e.length);n.push(e.charAt(i))}return n.join("")}function ft(){return P(Dt)}function mt(n){return $("authEvent",n.config.apiKey,n.name)}function ra(n){try{return JSON.parse(n)}catch{return null}}function sa(n){const e=Ve(n),t=e.link?decodeURIComponent(e.link):void 0,i=Ve(t).link,r=e.deep_link_id?decodeURIComponent(e.deep_link_id):void 0;return Ve(r).link||r||i||t||n}function Ve(n){if(!(n!=null&&n.includes("?")))return{};const[e,...t]=n.split("?");return ee(t.join("?"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const oa=500;class aa{constructor(){this._redirectPersistence=J,this._shouldInitProactively=!0,this.eventManagers=new Map,this.originValidationPromises={},this._completeRedirectFn=Ze,this._overrideRedirectResult=Wt}async _initialize(e){const t=e._key();let i=this.eventManagers.get(t);return i||(i=new Zo(e),this.eventManagers.set(t,i),this.attachCallbackListeners(e,i)),i}_openPopup(e){T(e,"operation-not-supported-in-this-environment")}async _openRedirect(e,t,i,r){Jo(e);const s=await this._initialize(e);await s.initialized(),s.resetRedirect(),eo(),await this._originValidation(e);const o=ea(e,i,r);await ta(e,o);const a=await Go(e,o,t),c=await $o(a);return Ko(e,s,c)}_isIframeWebStorageSupported(e,t){throw new Error("Method not implemented.")}_originValidation(e){const t=e._key();return this.originValidationPromises[t]||(this.originValidationPromises[t]=Bo(e)),this.originValidationPromises[t]}attachCallbackListeners(e,t){const{universalLinks:i,handleOpenURL:r,BuildInfo:s}=X(),o=setTimeout(async()=>{await mn(e),t.onEvent(gn())},oa),a=async u=>{clearTimeout(o);const h=await mn(e);let E=null;h&&(u!=null&&u.url)&&(E=na(h,u.url)),t.onEvent(E||gn())};typeof i<"u"&&typeof i.subscribe=="function"&&i.subscribe(null,a);const c=r,l=`${s.packageName.toLowerCase()}://`;X().handleOpenURL=async u=>{if(u.toLowerCase().startsWith(l)&&a({url:u}),typeof c=="function")try{c(u)}catch(h){console.error(h)}}}}const ca=aa;function gn(){return{type:"unknown",eventId:null,sessionId:null,urlResponse:null,postBody:null,tenantId:null,error:I("no-auth-event")}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function da(n,e){f(n)._logFramework(e)}var la="@firebase/auth-compat",ua="0.5.14";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ha=1e3;function ve(){var n;return((n=self==null?void 0:self.location)===null||n===void 0?void 0:n.protocol)||null}function pa(){return ve()==="http:"||ve()==="https:"}function hi(n=w()){return!!((ve()==="file:"||ve()==="ionic:"||ve()==="capacitor:")&&n.toLowerCase().match(/iphone|ipad|ipod|android/))}function fa(){return It()||wn()}function ma(){return yn()&&(document==null?void 0:document.documentMode)===11}function ga(n=w()){return/Edge\/\d+/.test(n)}function _a(n=w()){return ma()||ga(n)}function pi(){try{const n=self.localStorage,e=Ce();if(n)return n.setItem(e,"1"),n.removeItem(e),_a()?lt():!0}catch{return Ht()&&lt()}return!1}function Ht(){return typeof global<"u"&&"WorkerGlobalScope"in global&&"importScripts"in global}function ct(){return(pa()||vn()||hi())&&!fa()&&pi()&&!Ht()}function fi(){return hi()&&typeof document<"u"}async function va(){return fi()?new Promise(n=>{const e=setTimeout(()=>{n(!1)},ha);document.addEventListener("deviceready",()=>{clearTimeout(e),n(!0)})}):!1}function Ia(){return typeof window<"u"?window:null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const R={LOCAL:"local",NONE:"none",SESSION:"session"},he=d,mi="persistence";function ya(n,e){if(he(Object.values(R).includes(e),n,"invalid-persistence-type"),It()){he(e!==R.SESSION,n,"unsupported-persistence-type");return}if(wn()){he(e===R.NONE,n,"unsupported-persistence-type");return}if(Ht()){he(e===R.NONE||e===R.LOCAL&&lt(),n,"unsupported-persistence-type");return}he(e===R.NONE||pi(),n,"unsupported-persistence-type")}async function gt(n){await n._initializationPromise;const e=gi(),t=$(mi,n.config.apiKey,n.name);e&&e.setItem(t,n._getPersistence())}function wa(n,e){const t=gi();if(!t)return[];const i=$(mi,n,e);switch(t.getItem(i)){case R.NONE:return[se];case R.LOCAL:return[Ee,J];case R.SESSION:return[J];default:return[]}}function gi(){var n;try{return((n=Ia())===null||n===void 0?void 0:n.sessionStorage)||null}catch{return null}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ta=d;class j{constructor(){this.browserResolver=P(Fo),this.cordovaResolver=P(ca),this.underlyingResolver=null,this._redirectPersistence=J,this._completeRedirectFn=Ze,this._overrideRedirectResult=Wt}async _initialize(e){return await this.selectUnderlyingResolver(),this.assertedUnderlyingResolver._initialize(e)}async _openPopup(e,t,i,r){return await this.selectUnderlyingResolver(),this.assertedUnderlyingResolver._openPopup(e,t,i,r)}async _openRedirect(e,t,i,r){return await this.selectUnderlyingResolver(),this.assertedUnderlyingResolver._openRedirect(e,t,i,r)}_isIframeWebStorageSupported(e,t){this.assertedUnderlyingResolver._isIframeWebStorageSupported(e,t)}_originValidation(e){return this.assertedUnderlyingResolver._originValidation(e)}get _shouldInitProactively(){return fi()||this.browserResolver._shouldInitProactively}get assertedUnderlyingResolver(){return Ta(this.underlyingResolver,"internal-error"),this.underlyingResolver}async selectUnderlyingResolver(){if(this.underlyingResolver)return;const e=await va();this.underlyingResolver=e?this.cordovaResolver:this.browserResolver}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function _i(n){return n.unwrap()}function Ea(n){return n.wrapped()}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ka(n){return vi(n)}function Ra(n,e){var t;const i=(t=e.customData)===null||t===void 0?void 0:t._tokenResponse;if((e==null?void 0:e.code)==="auth/multi-factor-auth-required"){const r=e;r.resolver=new Pa(n,cs(n,e))}else if(i){const r=vi(e),s=e;r&&(s.credential=r,s.tenantId=i.tenantId||void 0,s.email=i.email||void 0,s.phoneNumber=i.phoneNumber||void 0)}}function vi(n){const{_tokenResponse:e}=n instanceof z?n.customData:n;if(!e)return null;if(!(n instanceof z)&&"temporaryProof"in e&&"phoneNumber"in e)return Y.credentialFromResult(n);const t=e.providerId;if(!t||t===ue.PASSWORD)return null;let i;switch(t){case ue.GOOGLE:i=C;break;case ue.FACEBOOK:i=S;break;case ue.GITHUB:i=N;break;case ue.TWITTER:i=O;break;default:const{oauthIdToken:r,oauthAccessToken:s,oauthTokenSecret:o,pendingToken:a,nonce:c}=e;return!s&&!o&&!r&&!a?null:a?t.startsWith("saml.")?oe._create(t,a):D._fromParams({providerId:t,signInMethod:t,pendingToken:a,idToken:r,accessToken:s}):new ie(t).credential({idToken:r,accessToken:s,rawNonce:c})}return n instanceof z?i.credentialFromError(n):i.credentialFromResult(n)}function k(n,e){return e.catch(t=>{throw t instanceof z&&Ra(n,t),t}).then(t=>{const i=t.operationType,r=t.user;return{operationType:i,credential:ka(t),additionalUserInfo:as(t),user:F.getOrCreate(r)}})}async function _t(n,e){const t=await e;return{verificationId:t.verificationId,confirm:i=>k(n,t.confirm(i))}}class Pa{constructor(e,t){this.resolver=t,this.auth=Ea(e)}get session(){return this.resolver.session}get hints(){return this.resolver.hints}resolveSignIn(e){return k(_i(this.auth),this.resolver.resolveSignIn(e))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class F{constructor(e){this._delegate=e,this.multiFactor=hs(e)}static getOrCreate(e){return F.USER_MAP.has(e)||F.USER_MAP.set(e,new F(e)),F.USER_MAP.get(e)}delete(){return this._delegate.delete()}reload(){return this._delegate.reload()}toJSON(){return this._delegate.toJSON()}getIdTokenResult(e){return this._delegate.getIdTokenResult(e)}getIdToken(e){return this._delegate.getIdToken(e)}linkAndRetrieveDataWithCredential(e){return this.linkWithCredential(e)}async linkWithCredential(e){return k(this.auth,Bn(this._delegate,e))}async linkWithPhoneNumber(e,t){return _t(this.auth,Hs(this._delegate,e,t))}async linkWithPopup(e){return k(this.auth,Ys(this._delegate,e,j))}async linkWithRedirect(e){return await gt(f(this.auth)),so(this._delegate,e,j)}reauthenticateAndRetrieveDataWithCredential(e){return this.reauthenticateWithCredential(e)}async reauthenticateWithCredential(e){return k(this.auth,$n(this._delegate,e))}reauthenticateWithPhoneNumber(e,t){return _t(this.auth,qs(this._delegate,e,t))}reauthenticateWithPopup(e){return k(this.auth,Js(this._delegate,e,j))}async reauthenticateWithRedirect(e){return await gt(f(this.auth)),io(this._delegate,e,j)}sendEmailVerification(e){return Yr(this._delegate,e)}async unlink(e){return await Mr(this._delegate,e),this}updateEmail(e){return es(this._delegate,e)}updatePassword(e){return ts(this._delegate,e)}updatePhoneNumber(e){return js(this._delegate,e)}updateProfile(e){return Zr(this._delegate,e)}verifyBeforeUpdateEmail(e,t){return Xr(this._delegate,e,t)}get emailVerified(){return this._delegate.emailVerified}get isAnonymous(){return this._delegate.isAnonymous}get metadata(){return this._delegate.metadata}get phoneNumber(){return this._delegate.phoneNumber}get providerData(){return this._delegate.providerData}get refreshToken(){return this._delegate.refreshToken}get tenantId(){return this._delegate.tenantId}get displayName(){return this._delegate.displayName}get email(){return this._delegate.email}get photoURL(){return this._delegate.photoURL}get providerId(){return this._delegate.providerId}get uid(){return this._delegate.uid}get auth(){return this._delegate.auth}}F.USER_MAP=new WeakMap;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const pe=d;class vt{constructor(e,t){if(this.app=e,t.isInitialized()){this._delegate=t.getImmediate(),this.linkUnderlyingAuth();return}const{apiKey:i}=e.options;pe(i,"invalid-api-key",{appName:e.name}),pe(i,"invalid-api-key",{appName:e.name});const r=typeof window<"u"?j:void 0;this._delegate=t.initialize({options:{persistence:ba(i,e.name),popupRedirectResolver:r}}),this._delegate._updateErrorMap(Si),this.linkUnderlyingAuth()}get emulatorConfig(){return this._delegate.emulatorConfig}get currentUser(){return this._delegate.currentUser?F.getOrCreate(this._delegate.currentUser):null}get languageCode(){return this._delegate.languageCode}set languageCode(e){this._delegate.languageCode=e}get settings(){return this._delegate.settings}get tenantId(){return this._delegate.tenantId}set tenantId(e){this._delegate.tenantId=e}useDeviceLanguage(){this._delegate.useDeviceLanguage()}signOut(){return this._delegate.signOut()}useEmulator(e,t){hr(this._delegate,e,t)}applyActionCode(e){return Hr(this._delegate,e)}checkActionCode(e){return Kn(this._delegate,e)}confirmPasswordReset(e,t){return xr(this._delegate,e,t)}async createUserWithEmailAndPassword(e,t){return k(this._delegate,jr(this._delegate,e,t))}fetchProvidersForEmail(e){return this.fetchSignInMethodsForEmail(e)}fetchSignInMethodsForEmail(e){return Jr(this._delegate,e)}isSignInWithEmailLink(e){return Br(this._delegate,e)}async getRedirectResult(){pe(ct(),this._delegate,"operation-not-supported-in-this-environment");const e=await ao(this._delegate,j);return e?k(this._delegate,Promise.resolve(e)):{credential:null,user:null}}addFrameworkForLogging(e){da(this._delegate,e)}onAuthStateChanged(e,t,i){const{next:r,error:s,complete:o}=_n(e,t,i);return this._delegate.onAuthStateChanged(r,s,o)}onIdTokenChanged(e,t,i){const{next:r,error:s,complete:o}=_n(e,t,i);return this._delegate.onIdTokenChanged(r,s,o)}sendSignInLinkToEmail(e,t){return Gr(this._delegate,e,t)}sendPasswordResetEmail(e,t){return Wr(this._delegate,e,t||void 0)}async setPersistence(e){ya(this._delegate,e);let t;switch(e){case R.SESSION:t=J;break;case R.LOCAL:t=await P(Ee)._isAvailable()?Ee:Dt;break;case R.NONE:t=se;break;default:return T("argument-error",{appName:this._delegate.name})}return this._delegate.setPersistence(t)}signInAndRetrieveDataWithCredential(e){return this.signInWithCredential(e)}signInAnonymously(){return k(this._delegate,Ur(this._delegate))}signInWithCredential(e){return k(this._delegate,Ke(this._delegate,e))}signInWithCustomToken(e){return k(this._delegate,Vr(this._delegate,e))}signInWithEmailAndPassword(e,t){return k(this._delegate,zr(this._delegate,e,t))}signInWithEmailLink(e,t){return k(this._delegate,$r(this._delegate,e,t))}signInWithPhoneNumber(e,t){return _t(this._delegate,xs(this._delegate,e,t))}async signInWithPopup(e){return pe(ct(),this._delegate,"operation-not-supported-in-this-environment"),k(this._delegate,Ks(this._delegate,e,j))}async signInWithRedirect(e){return pe(ct(),this._delegate,"operation-not-supported-in-this-environment"),await gt(this._delegate),to(this._delegate,e,j)}updateCurrentUser(e){return this._delegate.updateCurrentUser(e)}verifyPasswordResetCode(e){return qr(this._delegate,e)}unwrap(){return this._delegate}_delete(){return this._delegate._delete()}linkUnderlyingAuth(){this._delegate.wrapped=()=>this}}vt.Persistence=R;function _n(n,e,t){let i=n;typeof n!="function"&&({next:i,error:e,complete:t}=n);const r=i;return{next:o=>r(o&&F.getOrCreate(o)),error:e,complete:t}}function ba(n,e){const t=wa(n,e);if(typeof self<"u"&&!t.includes(Ee)&&t.push(Ee),typeof window<"u")for(const i of[Dt,J])t.includes(i)||t.push(i);return t.includes(se)||t.push(se),t}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class qt{constructor(){this.providerId="phone",this._delegate=new Y(_i(wt.auth()))}static credential(e,t){return Y.credential(e,t)}verifyPhoneNumber(e,t){return this._delegate.verifyPhoneNumber(e,t)}unwrap(){return this._delegate}}qt.PHONE_SIGN_IN_METHOD=Y.PHONE_SIGN_IN_METHOD;qt.PROVIDER_ID=Y.PROVIDER_ID;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Aa=d;class Sa{constructor(e,t,i=wt.app()){var r;Aa((r=i.options)===null||r===void 0?void 0:r.apiKey,"invalid-api-key",{appName:i.name}),this._delegate=new Vs(i.auth(),e,t),this.type=this._delegate.type}clear(){this._delegate.clear()}render(){return this._delegate.render()}verify(){return this._delegate.verify()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ca="auth-compat";function Na(n){n.INTERNAL.registerComponent(new dt(Ca,e=>{const t=e.getProvider("app-compat").getImmediate(),i=e.getProvider("auth");return new vt(t,i)},"PUBLIC").setServiceProps({ActionCodeInfo:{Operation:{EMAIL_SIGNIN:Z.EMAIL_SIGNIN,PASSWORD_RESET:Z.PASSWORD_RESET,RECOVER_EMAIL:Z.RECOVER_EMAIL,REVERT_SECOND_FACTOR_ADDITION:Z.REVERT_SECOND_FACTOR_ADDITION,VERIFY_AND_CHANGE_EMAIL:Z.VERIFY_AND_CHANGE_EMAIL,VERIFY_EMAIL:Z.VERIFY_EMAIL}},EmailAuthProvider:G,FacebookAuthProvider:S,GithubAuthProvider:N,GoogleAuthProvider:C,OAuthProvider:ie,SAMLAuthProvider:xe,PhoneAuthProvider:qt,PhoneMultiFactorGenerator:ui,RecaptchaVerifier:Sa,TwitterAuthProvider:O,Auth:vt,AuthCredential:de,Error:z}).setInstantiationMode("LAZY").setMultipleInstances(!1)),n.registerVersion(la,ua)}Na(wt);
