import { cookieJar, headerJar } from "../../support/request-context";
export const cookies = async () => cookieJar;
export const headers = async () => headerJar;
