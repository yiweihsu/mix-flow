import ProjectPage from "./project/[id]/page";

export default function Home() {
  return <ProjectPage params={{ id: "session" }} />;
}
