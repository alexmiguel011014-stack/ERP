import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Login | ALLU ERP",
	description: "Login do sistema ALLU ERP",
};

export default function SignIn() {
	return <SignInForm />;
}
