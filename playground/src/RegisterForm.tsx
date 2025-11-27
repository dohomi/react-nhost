import { useState } from "react";
import { useNhostAuth } from "../../src";

export function RegisterForm() {
  const {callAsync} = useNhostAuth({
    fn: "signUpEmailPassword",
    onSuccess: async({params, nhost, data}) => {
      console.log(params.email)

    },
    onError: ({error}) => {
      console.log(error.body.error )
    }
  })
  const [form, setForm] = useState({
    email: "",
    password: "",
  })

  const onSubmit = async () => {
    await callAsync({
      email: form.email,
      password: form.password,
      options:{
       redirectTo: window.origin 
      }
    },{
      headers:{
        "content-type": "application/json",
      }
    })
  }

  return (
      <form onSubmit={onSubmit}>
          
      </form>
  )
}