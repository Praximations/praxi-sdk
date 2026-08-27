export default function Page() {
  return (
    <main>
      <h1>Acme Store</h1>
      <form action="/api/contact" method="post">
        <input name="email" type="email" />
        <button type="submit">Contact us</button>
      </form>
    </main>
  );
}
